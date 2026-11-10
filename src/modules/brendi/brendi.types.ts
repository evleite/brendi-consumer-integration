import { z } from 'zod';

// ============================================
// Brendi API Response Schemas
// ============================================

export const BrendiEventSchema = z.object({
  event_id: z.string(),
  event_type: z.enum(['order.created', 'order.updated', 'order.cancelled', 'order.delivered']),
  resource_id: z.string(),
  created_at: z.string().datetime(),
});

export const BrendiEventsResponseSchema = z.object({
  events: z.array(BrendiEventSchema),
  next_cursor: z.string().optional(),
});

export type BrendiEvent = z.infer<typeof BrendiEventSchema>;
export type BrendiEventsResponse = z.infer<typeof BrendiEventsResponseSchema>;

// ============================================
// Brendi Order Schema (from GET /v1/orders/:id)
// ============================================

export const BrendiCustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email().optional(),
  phone: z.string(),
  document: z.string().optional(),
  created_at: z.string().datetime(),
});

export const BrendiAddressSchema = z.object({
  street: z.string(),
  number: z.string(),
  complement: z.string().optional(),
  neighborhood: z.string(),
  city: z.string(),
  state: z.string(),
  zip_code: z.string(),
});

export const BrendiItemOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.string(),
  price: z.number(), // centavos
});

export const BrendiOrderItemSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unit_price: z.number(), // centavos
  total_price: z.number(), // centavos
  observations: z.string().optional(),
  options: z.array(BrendiItemOptionSchema),
});

export const BrendiTotalsSchema = z.object({
  subtotal: z.number(), // centavos
  delivery_fee: z.number(), // centavos
  discount: z.number(), // centavos
  total: z.number(), // centavos
});

export const BrendiDeliverySchema = z.object({
  type: z.enum(['delivery', 'pickup']),
  address: BrendiAddressSchema.optional(),
  scheduled_for: z.string().datetime().optional(),
  instructions: z.string().optional(),
  distance_km: z.number().optional(),
  estimated_time_min: z.number().optional(),
});

export const BrendiPaymentSchema = z.object({
  method: z.enum(['credit_card', 'debit_card', 'pix', 'cash', 'online']),
  status: z.enum(['pending', 'approved', 'refused', 'refunded']),
  transaction_id: z.string().optional(),
  installments: z.number().int().positive(),
  card_brand: z.string().optional(),
  card_last4: z.string().optional(),
});

export const BrendiOrderSchema = z.object({
  id: z.string(),
  status: z.enum(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']),
  customer: BrendiCustomerSchema,
  items: z.array(BrendiOrderItemSchema),
  totals: BrendiTotalsSchema,
  delivery: BrendiDeliverySchema,
  payment: BrendiPaymentSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  confirmed_at: z.string().datetime().optional(),
  cancelled_at: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type BrendiCustomer = z.infer<typeof BrendiCustomerSchema>;
export type BrendiAddress = z.infer<typeof BrendiAddressSchema>;
export type BrendiItemOption = z.infer<typeof BrendiItemOptionSchema>;
export type BrendiOrderItem = z.infer<typeof BrendiOrderItemSchema>;
export type BrendiTotals = z.infer<typeof BrendiTotalsSchema>;
export type BrendiDelivery = z.infer<typeof BrendiDeliverySchema>;
export type BrendiPayment = z.infer<typeof BrendiPaymentSchema>;
export type BrendiOrder = z.infer<typeof BrendiOrderSchema>;

// ============================================
// OAuth Token Schema
// ============================================

export const BrendiTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
});

export type BrendiTokenResponse = z.infer<typeof BrendiTokenResponseSchema>;

// ============================================
// Validation Helpers
// ============================================

export function validateBrendiEvents(data: unknown): BrendiEventsResponse {
  return BrendiEventsResponseSchema.parse(data);
}

export function validateBrendiOrder(data: unknown): BrendiOrder {
  return BrendiOrderSchema.parse(data);
}

export function validateBrendiToken(data: unknown): BrendiTokenResponse {
  return BrendiTokenResponseSchema.parse(data);
}