/**
 * Local Storage Persistence Layer for Master Profile
 * Ensures persistent state across browser reloads with automatic schema normalization.
 */

import { normalizeMasterProfile, validateMasterProfile } from '../types/masterProfileSchema.js';
import { defaultMasterProfile } from '../data/defaultMasterProfile.js';

export const MASTER_PROFILE_STORAGE_KEY = 'ai_resume_builder_master_profile_v3';

/**
 * Loads the Master Profile from localStorage.
 * If not present, corrupt, or legacy mock data, initializes with defaultMasterProfile.
 *
 * @returns {Object} Normalized Master Profile
 */
export function loadMasterProfile() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultMasterProfile;
  }

  try {
    const raw = window.localStorage.getItem(MASTER_PROFILE_STORAGE_KEY);
    if (!raw) {
      return defaultMasterProfile;
    }

    const parsed = JSON.parse(raw);
    // Upgrade check: ensure user's actual profile is prioritized
    if (parsed.personalInfo?.fullName !== 'Jaya Sri Palli' && !parsed.metadata?.customUploaded) {
      return defaultMasterProfile;
    }

    const normalized = normalizeMasterProfile(parsed);
    return normalized;
  } catch (err) {
    console.warn('[Storage] Failed to read master profile from localStorage, falling back to default:', err);
    return defaultMasterProfile;
  }
}

/**
 * Persists the Master Profile into localStorage after normalization.
 *
 * @param {Object} profile - Master profile object
 * @returns {{ success: boolean, profile: Object, error?: string }}
 */
export function saveMasterProfile(profile) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { success: false, error: 'localStorage is unavailable in this environment' };
  }

  try {
    const normalized = normalizeMasterProfile({
      ...profile,
      metadata: {
        ...(profile.metadata || {}),
        lastUpdated: new Date().toISOString(),
      },
    });

    const validation = validateMasterProfile(normalized);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation errors: ${validation.errors.join(', ')}`,
      };
    }

    window.localStorage.setItem(MASTER_PROFILE_STORAGE_KEY, JSON.stringify(normalized));
    return { success: true, profile: normalized };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Resets the stored Master Profile back to the pre-loaded default profile.
 *
 * @returns {Object} The default Master Profile
 */
export function resetMasterProfile() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(MASTER_PROFILE_STORAGE_KEY);
    } catch (e) {
      console.warn('[Storage] Could not clear localStorage key:', e);
    }
  }
  return defaultMasterProfile;
}

/**
 * Utility to download the current Master Profile as a JSON file.
 *
 * @param {Object} profile
 */
export function downloadProfileAsJson(profile) {
  if (typeof window === 'undefined') return;

  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(profile, null, 2));
  const downloadAnchor = document.createElement('a');
  const fileName = `${(profile.personalInfo?.fullName || 'master_profile').toLowerCase().replace(/\s+/g, '_')}_profile.json`;

  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', fileName);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
