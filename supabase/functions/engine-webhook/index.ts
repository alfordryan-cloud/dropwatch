// Supabase Edge Function: Engine Webhook
// Notifies Railway backend when products are added/updated

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ENGINE_URL = Deno.env.get("ENGINE_URL"); // e.g., https://dropwatch-engine.up.railway.app

interface ProductPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: "products";
  record: {
    id: string;
    name: string;
    is_active: boolean;
  };
  old_record?: {
    id: string;
    is_active: boolean;
  };
}

serve(async (req) => {
  try {
    const payload: ProductPayload = await req.json();
    
    console.log(`[Webhook] Product ${payload.type}: ${payload.record.name}`);

    // If a product was activated, trigger immediate check
    if (payload.type === "INSERT" && payload.record.is_active) {
      console.log(`[Webhook] New active product - triggering check`);
      
      await fetch(`${ENGINE_URL}/check/${payload.record.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
    }
    
    // If a product was turned on (was inactive, now active)
    if (payload.type === "UPDATE" && 
        payload.record.is_active && 
        payload.old_record && 
        !payload.old_record.is_active) {
      console.log(`[Webhook] Product activated - triggering check`);
      
      await fetch(`${ENGINE_URL}/check/${payload.record.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(
      JSON.stringify({ success: true, action: payload.type }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[Webhook] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});
