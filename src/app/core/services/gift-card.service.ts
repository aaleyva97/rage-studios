import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase-service';
import { PaymentService } from './payment.service';
import { CreditsService } from './credits.service';
import { Package } from '../../features/landing/services/packages.service';

export interface GiftCard {
  id: string;
  code: string;
  package_id: string;
  status: 'created' | 'printed' | 'assigned' | 'used';
  assigned_user_id?: string;
  assigned_at?: string;
  assigned_by?: string;
  used_at?: string;
  purchase_id?: string;
  purchase_type: 'manual' | 'online';
  online_purchase_id?: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  // Joined data
  package?: Package;
  assigned_user?: { full_name: string; phone: string };
  created_by_user?: { full_name: string };
}

export interface GiftCardSearchFilters {
  status?: 'created' | 'printed' | 'assigned' | 'used' | 'all';
  packageId?: string;
  searchCode?: string;
  limit?: number;
  offset?: number;
}

export interface GiftCardCreateInput {
  packageId: string;
  quantity: number;
}

@Injectable({
  providedIn: 'root'
})
export class GiftCardService {
  private supabaseService = inject(SupabaseService);
  private paymentService = inject(PaymentService);
  private creditsService = inject(CreditsService);

  /**
   * Generate unique gift card code
   * Format: PACKAGENAME-XXXXXX (e.g., 4CLASES-X5F6G8)
   */
  private generateGiftCardCode(packageTitle: string): string {
    // Clean package title: uppercase, remove special chars, keep alphanumeric
    const cleanTitle = packageTitle
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 10);

    // Generate 6 random alphanumeric characters (exclude I, O, 0, 1 for clarity)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const randomPart = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');

    return `${cleanTitle}-${randomPart}`;
  }

  /**
   * Verify code uniqueness in database
   */
  private async isCodeUnique(code: string): Promise<boolean> {
    const { data, error } = await this.supabaseService.client
      .from('gift_cards')
      .select('id')
      .eq('code', code)
      .single();

    return error?.code === 'PGRST116'; // Not found = unique
  }

  /**
   * Generate unique code with retry logic
   */
  private async generateUniqueCode(packageTitle: string): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const code = this.generateGiftCardCode(packageTitle);
      const isUnique = await this.isCodeUnique(code);

      if (isUnique) {
        return code;
      }

      attempts++;
    }

    throw new Error('No se pudo generar un código único después de varios intentos');
  }

  /**
   * Create single or multiple gift cards
   */
  async createGiftCards(input: GiftCardCreateInput): Promise<{
    success: boolean;
    giftCards?: GiftCard[];
    error?: string
  }> {
    try {
      const currentUser = this.supabaseService.getUser();
      if (!currentUser) {
        return { success: false, error: 'Usuario no autenticado' };
      }

      // Validate package exists and is active
      const { data: packageData, error: packageError } = await this.supabaseService.client
        .from('packages')
        .select('*')
        .eq('id', input.packageId)
        .eq('is_active', true)
        .single();

      if (packageError || !packageData) {
        return { success: false, error: 'Paquete no encontrado o inactivo' };
      }

      // Validate quantity
      if (input.quantity < 1 || input.quantity > 100) {
        return { success: false, error: 'La cantidad debe estar entre 1 y 100' };
      }

      // Generate gift cards with unique codes
      const giftCardsToCreate = [];

      for (let i = 0; i < input.quantity; i++) {
        const code = await this.generateUniqueCode(packageData.title);

        giftCardsToCreate.push({
          code,
          package_id: input.packageId,
          status: 'created',
          purchase_type: 'manual',
          created_by: currentUser.id
        });
      }

      // Insert all gift cards
      const { data: createdGiftCards, error: insertError } = await this.supabaseService.client
        .from('gift_cards')
        .insert(giftCardsToCreate)
        .select(`
          *,
          package:packages(*),
          created_by_user:profiles!created_by(full_name)
        `);

      if (insertError) {
        console.error('Error creating gift cards:', insertError);
        return { success: false, error: insertError.message };
      }

      return { success: true, giftCards: createdGiftCards as GiftCard[] };
    } catch (error: any) {
      console.error('Error in createGiftCards:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search and list gift cards with filters
   */
  async searchGiftCards(filters: GiftCardSearchFilters = {}): Promise<{
    success: boolean;
    giftCards?: GiftCard[];
    totalCount?: number;
    error?: string
  }> {
    try {
      let query = this.supabaseService.client
        .from('gift_cards')
        .select(`
          *,
          package:packages(*),
          assigned_user:profiles!assigned_user_id(full_name, phone),
          created_by_user:profiles!created_by(full_name)
        `, { count: 'exact' });

      // Apply filters
      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters.packageId) {
        query = query.eq('package_id', filters.packageId);
      }

      if (filters.searchCode) {
        query = query.ilike('code', `%${filters.searchCode}%`);
      }

      // Pagination
      query = query.order('created_at', { ascending: false });

      if (filters.limit) {
        query = query.limit(filters.limit);
      }

      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Error searching gift cards:', error);
        return { success: false, error: error.message };
      }

      return { success: true, giftCards: data as GiftCard[], totalCount: count || 0 };
    } catch (error: any) {
      console.error('Error in searchGiftCards:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get gift card by code
   */
  async getGiftCardByCode(code: string): Promise<{
    success: boolean;
    giftCard?: GiftCard;
    error?: string
  }> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('gift_cards')
        .select(`
          *,
          package:packages(*)
        `)
        .eq('code', code.toUpperCase())
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return { success: false, error: 'Gift card no encontrada' };
        }
        return { success: false, error: error.message };
      }

      return { success: true, giftCard: data as GiftCard };
    } catch (error: any) {
      console.error('Error getting gift card:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update gift card status (single)
   */
  async updateGiftCardStatus(
    giftCardId: string,
    newStatus: 'created' | 'printed' | 'assigned' | 'used'
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate status transition
      const { data: currentGiftCard } = await this.supabaseService.client
        .from('gift_cards')
        .select('status')
        .eq('id', giftCardId)
        .single();

      if (!currentGiftCard) {
        return { success: false, error: 'Gift card no encontrada' };
      }

      // Prevent status regression
      const statusOrder = ['created', 'printed', 'assigned', 'used'];
      const currentIndex = statusOrder.indexOf(currentGiftCard.status);
      const newIndex = statusOrder.indexOf(newStatus);

      if (newIndex < currentIndex) {
        return { success: false, error: 'No se puede retroceder el estado de la gift card' };
      }

      const { error } = await this.supabaseService.client
        .from('gift_cards')
        .update({ status: newStatus })
        .eq('id', giftCardId);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error updating gift card status:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Bulk update gift card status
   */
  async bulkUpdateStatus(
    giftCardIds: string[],
    newStatus: 'created' | 'printed' | 'assigned' | 'used'
  ): Promise<{ success: boolean; updatedCount?: number; error?: string }> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('gift_cards')
        .update({ status: newStatus })
        .in('id', giftCardIds)
        .select();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, updatedCount: data?.length || 0 };
    } catch (error: any) {
      console.error('Error in bulk update:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Assign gift card to user (admin)
   */
  async assignGiftCardToUser(code: string, userId: string): Promise<{
    success: boolean;
    error?: string
  }> {
    try {
      const currentUser = this.supabaseService.getUser();
      if (!currentUser) {
        return { success: false, error: 'Usuario administrador no autenticado' };
      }

      // Get gift card
      const codeResult = await this.getGiftCardByCode(code);
      if (!codeResult.success || !codeResult.giftCard) {
        return { success: false, error: codeResult.error || 'Gift card no encontrada' };
      }

      const giftCard = codeResult.giftCard;

      // Validate status
      if (giftCard.status !== 'created' && giftCard.status !== 'printed') {
        return { success: false, error: 'Esta gift card ya fue asignada o usada' };
      }

      // Update gift card
      const { error } = await this.supabaseService.client
        .from('gift_cards')
        .update({
          status: 'assigned',
          assigned_user_id: userId,
          assigned_at: new Date().toISOString(),
          assigned_by: currentUser.id
        })
        .eq('id', giftCard.id);

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error: any) {
      console.error('Error assigning gift card:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Redeem gift card (user)
   * Creates purchase and assigns credits
   */
  async redeemGiftCard(code: string): Promise<{
    success: boolean;
    purchase?: any;
    creditsAdded?: number;
    error?: string
  }> {
    try {
      const currentUser = this.supabaseService.getUser();
      if (!currentUser) {
        return { success: false, error: 'Debes iniciar sesión para usar una gift card' };
      }

      // Get gift card with package info
      const codeResult = await this.getGiftCardByCode(code);
      if (!codeResult.success || !codeResult.giftCard) {
        return { success: false, error: codeResult.error || 'Gift card no encontrada' };
      }

      const giftCard = codeResult.giftCard;

      // Validate status
      if (giftCard.status === 'used') {
        return { success: false, error: 'Esta gift card ya fue utilizada' };
      }

      if (giftCard.status === 'assigned' && giftCard.assigned_user_id !== currentUser.id) {
        return { success: false, error: 'Esta gift card está asignada a otro usuario' };
      }

      // Validate package is active
      if (!giftCard.package || !giftCard.package.is_active) {
        return { success: false, error: 'El paquete asociado no está disponible' };
      }

      // 1. Create purchase with transaction_type='giftcard'
      const { data: purchase, error: purchaseError } = await this.supabaseService.client
        .from('purchases')
        .insert({
          user_id: currentUser.id,
          package_id: giftCard.package_id,
          amount: giftCard.package.price,
          status: 'completed',
          transaction_type: 'giftcard',
          gift_card_id: giftCard.id,
          completed_at: new Date().toISOString()
        })
        .select()
        .single();

      if (purchaseError) {
        console.error('Error creating purchase:', purchaseError);
        return { success: false, error: 'Error al procesar la gift card' };
      }

      // 2. Assign credits using PaymentService
      await this.paymentService.assignCreditsToUser(
        purchase.id,
        giftCard.package,
        currentUser.id
      );

      // 3. Update gift card status to 'used'
      const { error: updateError } = await this.supabaseService.client
        .from('gift_cards')
        .update({
          status: 'used',
          used_at: new Date().toISOString(),
          purchase_id: purchase.id,
          assigned_user_id: currentUser.id,
          assigned_at: giftCard.assigned_at || new Date().toISOString()
        })
        .eq('id', giftCard.id);

      if (updateError) {
        console.error('Error updating gift card:', updateError);
        // Don't fail - credits were assigned successfully
      }

      // 4. Refresh user credits
      await this.creditsService.forceRefreshCredits(currentUser.id);

      return {
        success: true,
        purchase,
        creditsAdded: giftCard.package.classes_count ?? undefined
      };
    } catch (error: any) {
      console.error('Error redeeming gift card:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get user's gift cards
   */
  async getUserGiftCards(userId?: string): Promise<{
    success: boolean;
    giftCards?: GiftCard[];
    error?: string
  }> {
    try {
      const targetUserId = userId || this.supabaseService.getUser()?.id;
      if (!targetUserId) {
        return { success: false, error: 'Usuario no encontrado' };
      }

      const { data, error } = await this.supabaseService.client
        .from('gift_cards')
        .select(`
          *,
          package:packages(*)
        `)
        .eq('assigned_user_id', targetUserId)
        .order('created_at', { ascending: false });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, giftCards: data as GiftCard[] };
    } catch (error: any) {
      console.error('Error getting user gift cards:', error);
      return { success: false, error: error.message };
    }
  }
}
