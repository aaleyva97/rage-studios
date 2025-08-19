import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { StripeService } from 'ngx-stripe';
import { environment } from '../../../environments/environment';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Package } from '../../features/landing/services/packages.service';
import { firstValueFrom } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';

export interface Purchase {
  id: string;
  user_id: string;
  package_id: string;
  stripe_payment_intent_id?: string;
  stripe_session_id?: string;
  amount: number;
  status: string;
  transaction_type: string;
  assigned_by?: string;
  created_at: string;
  completed_at?: string;
}

export interface CreditBatch {
  id: string;
  user_id: string;
  purchase_id: string;
  package_id: string;
  credits_total: number;
  credits_remaining: number;
  validity_days: number;
  is_unlimited: boolean;
  expiration_activated: boolean;
  expiration_date?: string;
  first_use_date?: string;
  created_at: string;
}

export interface CreditHistory {
  id: string;
  user_id: string;
  credit_batch_id?: string;
  type: 'added' | 'used' | 'refunded' | 'expired';
  amount: number;
  description: string;
  booking_id?: string;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private stripeService = inject(StripeService);
  private supabaseClient: SupabaseClient;
  private platformId = inject(PLATFORM_ID);
  
  constructor() {
    this.supabaseClient = createClient(environment.SUPABASE_URL, environment.SUPABASE_KEY);
  }
  
  async createCheckoutSession(packageData: Package, userId: string) {
    try {
      // Solo ejecutar en el cliente
      if (!isPlatformBrowser(this.platformId)) {
        throw new Error('Payment must be initiated from browser');
      }
      
      // Crear registro de compra pendiente
      const { data: purchase, error: purchaseError } = await this.supabaseClient
        .from('purchases')
        .insert({
          user_id: userId,
          package_id: packageData.id,
          amount: packageData.price,
          status: 'pending',
          transaction_type: 'online'
        })
        .select()
        .single();
      
      if (purchaseError) throw purchaseError;
      
      // URLs hardcodeadas para desarrollo - CAMBIAR en producción
      const successUrl = `http://localhost:4200/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `http://localhost:4200/checkout/cancel`;
      
      console.log('Creating checkout with URLs:', { successUrl, cancelUrl });
      
      // Llamar a Edge Function
      const { data, error } = await this.supabaseClient.functions.invoke('create-checkout-session', {
        body: {
          packageData,
          userId,
          purchaseId: purchase.id,
          successUrl,
          cancelUrl
        }
      });
      
      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }
      
      console.log('Checkout session created:', data);
      return data;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw error;
    }
  }
  
  // Asignar paquete manualmente (para admins)
  async assignPackageManually(packageData: Package, userId: string, adminId: string) {
    try {
      // Crear registro de compra manual
      const { data: purchase, error: purchaseError } = await this.supabaseClient
        .from('purchases')
        .insert({
          user_id: userId,
          package_id: packageData.id,
          amount: packageData.price,
          status: 'completed',
          transaction_type: 'manual',
          assigned_by: adminId,
          completed_at: new Date().toISOString()
        })
        .select()
        .single();
      
      if (purchaseError) throw purchaseError;
      
      // Asignar créditos
      await this.assignCreditsToUser(purchase.id, packageData, userId);
      
      return purchase;
    } catch (error) {
      console.error('Error assigning package manually:', error);
      throw error;
    }
  }
  
  // Asignar créditos al usuario
  private async assignCreditsToUser(purchaseId: string, packageData: Package, userId: string) {
    // Crear lote de créditos
    const { data: creditBatch, error: creditError } = await this.supabaseClient
      .from('credit_batches')
      .insert({
        user_id: userId,
        purchase_id: purchaseId,
        package_id: packageData.id,
        credits_total: packageData.is_unlimited ? 999999 : packageData.credits_count,
        credits_remaining: packageData.is_unlimited ? 999999 : packageData.credits_count,
        validity_days: packageData.validity_days,
        is_unlimited: packageData.is_unlimited,
        expiration_activated: false
      })
      .select()
      .single();
    
    if (creditError) throw creditError;
    
    // Registrar en historial
    await this.supabaseClient
      .from('credit_history')
      .insert({
        user_id: userId,
        credit_batch_id: creditBatch.id,
        type: 'added',
        amount: packageData.is_unlimited ? 999999 : packageData.credits_count,
        description: `Créditos asignados por compra de paquete: ${packageData.title}`
      });
    
    return creditBatch;
  }
  
  // Manejar pago exitoso de Stripe
  async handleSuccessfulPayment(sessionId: string) {
    // Obtener la compra por session_id
    const { data: purchase, error: purchaseError } = await this.supabaseClient
      .from('purchases')
      .select('*, packages(*)')
      .eq('stripe_session_id', sessionId)
      .single();
    
    if (purchaseError) throw purchaseError;
    
    // Actualizar estado de la compra
    await this.supabaseClient
      .from('purchases')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', purchase.id);
    
    // Asignar créditos
    await this.assignCreditsToUser(purchase.id, purchase.packages, purchase.user_id);
    
    return purchase;
  }
  
  // Obtener historial de créditos
  async getCreditHistory(userId: string): Promise<CreditHistory[]> {
    const { data, error } = await this.supabaseClient
      .from('credit_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  // Obtener historial de pagos
  async getPurchaseHistory(userId: string): Promise<Purchase[]> {
    const { data, error } = await this.supabaseClient
      .from('purchases')
      .select('*, packages(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data || [];
  }
  
  // Obtener créditos disponibles
  async getAvailableCredits(userId: string): Promise<number> {
    const { data, error } = await this.supabaseClient
      .from('user_available_credits')
      .select('total_credits')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      console.error('Error getting available credits:', error);
      return 0;
    }
    
    return data?.total_credits || 0;
  }
  
  // Usar créditos (se activará la expiración si es el primer uso)
  async useCredits(userId: string, amount: number, bookingId: string): Promise<boolean> {
    // Obtener lotes de créditos ordenados por fecha de expiración
    const { data: batches, error } = await this.supabaseClient
      .from('credit_batches')
      .select('*')
      .eq('user_id', userId)
      .gt('credits_remaining', 0)
      .order('expiration_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });
    
    if (error || !batches || batches.length === 0) {
      return false;
    }
    
    let creditsToUse = amount;
    
    for (const batch of batches) {
      if (creditsToUse <= 0) break;
      
      // Si es el primer uso, activar expiración
      if (!batch.expiration_activated && !batch.is_unlimited) {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + batch.validity_days);
        
        await this.supabaseClient
          .from('credit_batches')
          .update({
            expiration_activated: true,
            first_use_date: new Date().toISOString(),
            expiration_date: expirationDate.toISOString()
          })
          .eq('id', batch.id);
      }
      
      const creditsFromBatch = Math.min(creditsToUse, batch.credits_remaining);
      
      // Actualizar créditos restantes
      await this.supabaseClient
        .from('credit_batches')
        .update({
          credits_remaining: batch.credits_remaining - creditsFromBatch
        })
        .eq('id', batch.id);
      
      // Registrar en historial
      await this.supabaseClient
        .from('credit_history')
        .insert({
          user_id: userId,
          credit_batch_id: batch.id,
          type: 'used',
          amount: -creditsFromBatch,
          description: 'Crédito usado para reserva',
          booking_id: bookingId
        });
      
      creditsToUse -= creditsFromBatch;
    }
    
    return creditsToUse === 0;
  }
  
  // Devolver créditos (cancelación de reserva)
  async refundCredits(userId: string, amount: number, bookingId: string, batchId: string): Promise<void> {
    // Actualizar créditos en el lote
    const { data: batch } = await this.supabaseClient
      .from('credit_batches')
      .select('*')
      .eq('id', batchId)
      .single();
    
    if (batch) {
      await this.supabaseClient
        .from('credit_batches')
        .update({
          credits_remaining: batch.credits_remaining + amount
        })
        .eq('id', batchId);
      
      // Registrar en historial
      await this.supabaseClient
        .from('credit_history')
        .insert({
          user_id: userId,
          credit_batch_id: batchId,
          type: 'refunded',
          amount: amount,
          description: 'Crédito devuelto por cancelación de reserva',
          booking_id: bookingId
        });
    }
  }
}