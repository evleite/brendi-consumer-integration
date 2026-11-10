import { z } from 'zod';

// ============================================
// Consumer API Schemas (formato esperado pelo Consumer)
// Baseado na documentação: https://ajuda.programaconsumer.com.br/integracao-api-do-parceiro/
// ============================================

export const ConsumerCustomerSchema = z.object({
  nome: z.string(),
  telefone: z.string(),
  email: z.string().email().optional(),
  documento: z.string().optional(),
});

export const ConsumerItemOptionSchema = z.object({
  nome: z.string(),
  valor: z.string(),
  preco: z.number(), // centavos
});

export const ConsumerOrderItemSchema = z.object({
  produto_id: z.string(),
  nome: z.string(),
  quantidade: z.number().int().positive(),
  preco_unitario: z.number(), // centavos
  preco_total: z.number(), // centavos
  observacoes: z.string().optional(),
  opcoes: z.array(ConsumerItemOptionSchema),
});

export const ConsumerTotalsSchema = z.object({
  subtotal: z.number(), // centavos
  taxa_entrega: z.number(), // centavos
  desconto: z.number(), // centavos
  total: z.number(), // centavos
});

export const ConsumerAddressSchema = z.object({
  logradouro: z.string(),
  numero: z.string(),
  complemento: z.string().optional(),
  bairro: z.string(),
  cidade: z.string(),
  estado: z.string(),
  cep: z.string(),
});

export const ConsumerDeliverySchema = z.object({
  tipo: z.enum(['entrega', 'retirada']),
  endereco: ConsumerAddressSchema.optional(),
  agendado_para: z.string().datetime().optional(),
  observacoes: z.string().optional(),
});

export const ConsumerPaymentSchema = z.object({
  forma: z.enum(['credito', 'debito', 'pix', 'dinheiro', 'online']),
  status: z.enum(['pendente', 'aprovado', 'recusado', 'estornado']),
  transacao_id: z.string().optional(),
  parcelas: z.number().int().positive(),
});

export const ConsumerOrderSchema = z.object({
  id: z.string(),
  cliente: ConsumerCustomerSchema,
  itens: z.array(ConsumerOrderItemSchema),
  totais: ConsumerTotalsSchema,
  entrega: ConsumerDeliverySchema,
  pagamento: ConsumerPaymentSchema,
  criado_em: z.string().datetime(),
  metadata: z.record(z.unknown()).optional(),
});

export const ConsumerPendingOrdersResponseSchema = z.object({
  pedidos: z.array(ConsumerOrderSchema),
});

export const ConsumerOrderDetailResponseSchema = z.object({
  pedido: ConsumerOrderSchema,
});

export const ConsumerAckRequestSchema = z.object({
  consumer_order_id: z.string(),
});

export const ConsumerAckResponseSchema = z.object({
  success: z.boolean(),
  acked_at: z.string().datetime(),
});

export type ConsumerCustomer = z.infer<typeof ConsumerCustomerSchema>;
export type ConsumerItemOption = z.infer<typeof ConsumerItemOptionSchema>;
export type ConsumerOrderItem = z.infer<typeof ConsumerOrderItemSchema>;
export type ConsumerTotals = z.infer<typeof ConsumerTotalsSchema>;
export type ConsumerAddress = z.infer<typeof ConsumerAddressSchema>;
export type ConsumerDelivery = z.infer<typeof ConsumerDeliverySchema>;
export type ConsumerPayment = z.infer<typeof ConsumerPaymentSchema>;
export type ConsumerOrder = z.infer<typeof ConsumerOrderSchema>;
export type ConsumerPendingOrdersResponse = z.infer<typeof ConsumerPendingOrdersResponseSchema>;
export type ConsumerOrderDetailResponse = z.infer<typeof ConsumerOrderDetailResponseSchema>;
export type ConsumerAckRequest = z.infer<typeof ConsumerAckRequestSchema>;
export type ConsumerAckResponse = z.infer<typeof ConsumerAckResponseSchema>;

// ============================================
// Validation Helpers
// ============================================

export function validateConsumerOrder(data: unknown): ConsumerOrder {
  return ConsumerOrderSchema.parse(data);
}

export function validateConsumerAckRequest(data: unknown): ConsumerAckRequest {
  return ConsumerAckRequestSchema.parse(data);
}

export function validateConsumerPendingOrdersResponse(data: unknown): ConsumerPendingOrdersResponse {
  return ConsumerPendingOrdersResponseSchema.parse(data);
}