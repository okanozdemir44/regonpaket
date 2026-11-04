import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as jose from "jsr:@panva/jose@6";

type NotifyBody = {
  courier_id?: string;
  /** İstemci zaten çektiyse tekrar SELECT atlanır */
  fcm_token?: string;
  title?: string;
  body?: string;
  data?: Record<string, string>;
};

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseServiceAccount(): ServiceAccount | null {
  const raw = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      return null;
    }
    return {
      ...parsed,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  } catch {
    return null;
  }
}

async function getFcmAccessToken(sa: ServiceAccount): Promise<string> {
  const key = await jose.importPKCS8(sa.private_key, "RS256");
  const assertion = await new jose.SignJWT({
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = (await res.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error || "FCM access token alınamadı");
  }
  return data.access_token;
}

async function sendFcmHttpV1(opts: {
  sa: ServiceAccount;
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  const accessToken = await getFcmAccessToken(opts.sa);
  const url = `https://fcm.googleapis.com/v1/projects/${opts.sa.project_id}/messages:send`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token: opts.token,
        notification: {
          title: opts.title,
          body: opts.body,
        },
        data: opts.data ?? {},
        android: {
          priority: "HIGH",
          notification: {
            channel_id: "new_package",
            sound: "default",
            default_vibrate_timings: true,
          },
        },
      },
    }),
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(
      typeof payload === "object"
        ? JSON.stringify(payload)
        : "FCM gönderimi başarısız"
    );
  }
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const sa = parseServiceAccount();
    if (!sa) {
      return json(
        {
          ok: false,
          error:
            "FIREBASE_SERVICE_ACCOUNT_JSON secret tanımlı değil. Firebase Console → Project settings → Service accounts → Generate new private key JSON'unu secret olarak ekleyin.",
        },
        500
      );
    }

    const input = (await req.json()) as NotifyBody;
    if (!input.courier_id) {
      return json({ ok: false, error: "courier_id zorunlu" }, 400);
    }

    let fcmToken = input.fcm_token?.trim() || "";
    let courierId = input.courier_id;

    if (!fcmToken) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceKey) {
        return json({ ok: false, error: "Supabase env eksik" }, 500);
      }

      const admin = createClient(supabaseUrl, serviceKey);
      const { data: courier, error } = await admin
        .from("couriers")
        .select("id, fcm_token")
        .eq("id", input.courier_id)
        .maybeSingle();

      if (error) return json({ ok: false, error: error.message }, 500);
      fcmToken = courier?.fcm_token?.trim() || "";
      courierId = courier?.id || input.courier_id;
    }

    if (!fcmToken) {
      return json({
        ok: false,
        skipped: true,
        reason: "Kuryenin kayıtlı FCM tokeni yok",
      });
    }

    const title = input.title || "Yeni Sipariş Atandı!";
    const body = input.body || "Yeni bir paket size atandı";

    const result = await sendFcmHttpV1({
      sa,
      token: fcmToken,
      title,
      body,
      data: {
        courier_id: courierId,
        ...(input.data ?? {}),
      },
    });

    return json({ ok: true, result });
  } catch (err) {
    return json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Bilinmeyen hata",
      },
      500
    );
  }
});
