import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { SupabaseService } from '../services/supabase-service';

export const authGuard: CanActivateFn = async (route, state) => {
  const supabaseService = inject(SupabaseService);
  const router = inject(Router);
  
  const isLoggedIn = supabaseService.isLoggedIn();
  
  if (!isLoggedIn) {
    router.navigate(['/']);
    return false;
  }
  
  return true;
};