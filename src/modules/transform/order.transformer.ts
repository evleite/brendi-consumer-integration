import { logger } from '../../shared/logger/logger.js';
import { CONSTANTS } from '../../config/constants.js';
import {
  BrendiOrder,
  BrendiCustomer,
  BrendiOrderItem,
  BrendiTotals,
  BrendiDelivery,
  BrendiPayment,
  BrendiAddress,
  BrendiItemOption,
} from '../brendi/brendi.types.js';
import {
  ConsumerOrder,
  ConsumerCustomer,
  ConsumerOrderItem,
  ConsumerTotals,
  ConsumerDelivery,
  ConsumerAddress,
  ConsumerPayment,
  ConsumerItemOption,
  validateConsumerOrder,
} from '../consumer/consumer.types.js';

interface TransformedOrder {
  id: string;
  brendiOrderId: string;
  status: string;
  cliente: ConsumerCustomer;
  itens: ConsumerOrderItem[];
  totais: ConsumerTotals;
  entrega: ConsumerDelivery;
  pagamento: ConsumerPayment;
  metadata: Record<string, unknown>;
  criado_em: string;
}

export class OrderTransformer {
  transform(brendiOrder: BrendiOrder): TransformedOrder {
    logger.debug({ orderId: brendiOrder.id }, 'Transforming order Brendi → Consumer');

    const transformed: TransformedOrder = {
      id: brendiOrder.id,
      brendiOrderId: brendiOrder.id,
      status: this.mapStatus(brendiOrder.status),
      cliente: this.transformCustomer(brendiOrder.customer),
      itens: brendiOrder.items.map((item) => this.transformItem(item)),
      totais: this.transformTotals(brendiOrder.totals),
      entrega: this.transformDelivery(brendiOrder.delivery),
      pagamento: this.transformPayment(brendiOrder.payment),
      metadata: {
        brendiStatus: brendiOrder.status,
        brendiCreatedAt: brendiOrder.created_at,
        brendiUpdatedAt: brendiOrder.updated_at,
        ...brendiOrder.metadata,
      },
      criado_em: brendiOrder.created_at,
    };

    // Validar saída
    validateConsumerOrder(transformed);

    return transformed;
  }

  private mapStatus(brendiStatus: string): string {
    const statusMap: Record<string, string> = {
      pending: 'pending',
      confirmed: 'pending',
      preparing: 'pending',
      ready: 'pending',
      delivered: 'delivered',
      cancelled: 'cancelled',
    };
    return statusMap[brendiStatus] ?? 'pending';
  }

  private transformCustomer(customer: BrendiCustomer): ConsumerCustomer {
    return {
      nome: customer.name,
      telefone: this.formatPhone(customer.phone),
      email: customer.email,
      documento: customer.document ? this.cleanDocument(customer.document) : undefined,
    };
  }

  private transformItem(item: BrendiOrderItem): ConsumerOrderItem {
    return {
      produto_id: item.product_id,
      nome: item.name,
      quantidade: item.quantity,
      preco_unitario: item.unit_price,
      preco_total: item.total_price,
      observacoes: item.observations,
      opcoes: item.options.map((opt) => this.transformItemOption(opt)),
    };
  }

  private transformItemOption(option: BrendiItemOption): ConsumerItemOption {
    return {
      nome: option.name,
      valor: option.value,
      preco: option.price,
    };
  }

  private transformTotals(totals: BrendiTotals): ConsumerTotals {
    return {
      subtotal: totals.subtotal,
      taxa_entrega: totals.delivery_fee,
      desconto: totals.discount,
      total: totals.total,
    };
  }

  private transformDelivery(delivery: BrendiDelivery): ConsumerDelivery {
    return {
      tipo: delivery.type === 'delivery' ? 'entrega' : 'retirada',
      endereco: delivery.address ? this.transformAddress(delivery.address) : undefined,
      agendado_para: delivery.scheduled_for,
      observacoes: delivery.instructions,
    };
  }

  private transformAddress(address: BrendiAddress): ConsumerAddress {
    return {
      logradouro: address.street,
      numero: address.number,
      complemento: address.complement,
      bairro: address.neighborhood,
      cidade: address.city,
      estado: address.state,
      cep: this.formatCEP(address.zip_code),
    };
  }

  private transformPayment(payment: BrendiPayment): ConsumerPayment {
    return {
      forma: this.mapPaymentMethod(payment.method),
      status: this.mapPaymentStatus(payment.status),
      transacao_id: payment.transaction_id,
      parcelas: payment.installments,
    };
  }

  private mapPaymentMethod(method: string): ConsumerPayment['forma'] {
    const methodMap: Record<string, ConsumerPayment['forma']> = {
      credit_card: 'credito',
      debit_card: 'debito',
      pix: 'pix',
      cash: 'dinheiro',
      online: 'online',
    };
    return methodMap[method] ?? 'online';
  }

  private mapPaymentStatus(status: string): ConsumerPayment['status'] {
    const statusMap: Record<string, ConsumerPayment['status']> = {
      pending: 'pendente',
      approved: 'aprovado',
      refused: 'recusado',
      refunded: 'estornado',
    };
    return statusMap[status] ?? 'pendente';
  }

  private formatPhone(phone: string): string {
    // Remover formatação, manter apenas números
    const numbers = phone.replace(/\D/g, '');
    // Formatar como (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
    if (numbers.length === 11) {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
    }
    if (numbers.length === 10) {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
    }
    return phone; // Retorna original se não conseguir formatar
  }

  private cleanDocument(document: string): string {
    return document.replace(/\D/g, '');
  }

  private formatCEP(cep: string): string {
    const numbers = cep.replace(/\D/g, '');
    if (numbers.length === 8) {
      return `${numbers.slice(0, 5)}-${numbers.slice(5)}`;
    }
    return cep;
  }
}

export const orderTransformer = new OrderTransformer();