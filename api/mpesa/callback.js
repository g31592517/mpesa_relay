import { createClient } from '@supabase/supabase-js';

/**
 * Vercel Serverless Function — M-Pesa STK Push Callback
 *
 * Safaricom POSTs here after a payment succeeds or fails.
 * We persist the result to Supabase so the local backend can
 * poll for it (the local backend is not publicly reachable).
 *
 * Deploy URL example: https://mpesa-relay.vercel.app/api/mpesa/callback
 * Set MPESA_CALLBACK_URL in your backend .env to this URL.
 */

let supabase = null;

function getClient() {
  if (!supabase) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
    supabase = createClient(url, key);
  }
  return supabase;
}

export default async function handler(req, res) {
  // Safaricom only POSTs — ignore everything else
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Always respond 200 quickly — Safaricom retries on non-200
  try {
    const body = req.body;
    const callback = body?.Body?.stkCallback;

    if (!callback) {
      console.error('Invalid callback payload:', JSON.stringify(body));
      // Still 200 so Safaricom does not spam retries
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;

    // Extract CallbackMetadata items (only present on successful payments)
    const meta = {};
    if (CallbackMetadata?.Item) {
      for (const item of CallbackMetadata.Item) {
        meta[item.Name] = item.Value;
      }
    }

    const client = getClient();

    // upsert so duplicate callbacks don't create duplicates
    const { error } = await client.from('mpesa_callbacks').upsert(
      {
        checkout_request_id: CheckoutRequestID,
        result_code:         ResultCode,
        result_desc:         ResultDesc ?? null,
        amount:              meta.Amount               ?? null,
        mpesa_receipt:       meta.MpesaReceiptNumber   ?? null,
        phone_number:        meta.PhoneNumber ? String(meta.PhoneNumber) : null,
        raw_payload:         body,
      },
      { onConflict: 'checkout_request_id' }
    );

    if (error) {
      console.error('Supabase upsert error:', error);
    } else {
      console.log(`✅ Callback stored: ${CheckoutRequestID} → ResultCode ${ResultCode}`);
    }
  } catch (err) {
    // Log but don't return non-200 — Safaricom will retry aggressively on errors
    console.error('Callback handler error:', err);
  }

  // Safaricom expects exactly this response body
  return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
}
