import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { SupabaseService } from '../services/supabase-service';

export const adminGuard: CanActivateFn = async (route, state) => {
  const supabaseService = inject(SupabaseService);
  const router = inject(Router);
  
  const user = supabaseService.getUser();
  
  if (!user) {
    router.navigate(['/']);
    return false;
  }
  
  try {
    const profile = await supabaseService.getProfile(user.id);
    
    if (profile.role !== 'admin') {
      router.navigate(['/']);
      return false;
    }
    
    return true;
  } catch (error) {
    router.navigate(['/']);
    return false;
  }
};