// Supabase Edge Function: Purchase Alert Email
// Triggers when a new purchase is inserted into the purchases table

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ALERT_EMAIL = Deno.env.get("ALERT_EMAIL") || "ryan@radical.company";

interface PurchasePayload {
  type: "INSERT";
  table: "purchases";
  record: {
    id: string;
    product_name: string;
    retailer: string;
    quantity: number;
    price: number;
    total: number;
    status: string;
    order_number: string;
    purchased_at: string;
  };
}

serve(async (req) => {
  try {
    const payload: PurchasePayload = await req.json();
    const purchase = payload.record;

    // Format the email
    const subject = `🎯 DROPWATCH: ${purchase.product_name} purchased!`;
    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0A0A0B 0%, #1a1a1b 100%); padding: 32px; border-radius: 12px;">
          <h1 style="color: #00D26A; margin: 0 0 24px; font-size: 24px;">
            ⚡ Purchase Successful!
          </h1>
          
          <div style="background: rgba(255,255,255,0.05); padding: 24px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="color: #FFF; margin: 0 0 16px; font-size: 20px;">
              ${purchase.product_name}
            </h2>
            
            <table style="width: 100%; color: #AAA; font-size: 14px;">
              <tr>
                <td style="padding: 8px 0;">Retailer:</td>
                <td style="color: #FFF; text-align: right;">${purchase.retailer}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0;">Quantity:</td>
                <td style="color: #FFF; text-align: right;">${purchase.quantity}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0;">Price:</td>
                <td style="color: #00D26A; text-align: right; font-weight: 600;">$${purchase.price.toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; border-top: 1px solid rgba(255,255,255,0.1);">Total:</td>
                <td style="color: #00D26A; text-align: right; font-weight: 700; font-size: 18px; border-top: 1px solid rgba(255,255,255,0.1);">
                  $${purchase.total.toFixed(2)}
                </td>
              </tr>
            </table>
          </div>
          
          <div style="background: rgba(0,210,106,0.1); padding: 16px; border-radius: 8px; border-left: 4px solid #00D26A;">
            <p style="margin: 0; color: #00D26A; font-size: 14px;">
              <strong>Order #:</strong> ${purchase.order_number}
            </p>
            <p style="margin: 8px 0 0; color: #888; font-size: 12px;">
              ${new Date(purchase.purchased_at).toLocaleString()}
            </p>
          </div>
          
          <p style="color: #666; font-size: 12px; margin: 24px 0 0; text-align: center;">
            DROPWATCH by Collector Station
          </p>
        </div>
      </div>
    `;

    // Send email via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "DROPWATCH <alerts@collectorstation.com>",
        to: [ALERT_EMAIL],
        subject: subject,
        html: html,
      }),
    });

    const data = await res.json();

    return new Response(JSON.stringify({ success: true, data }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
