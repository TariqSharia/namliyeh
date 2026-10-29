import { useQuery } from '@powersync/react';
import { createContext, useContext, type ReactNode } from 'react';
import type { Ctx } from '../data/actions';
import { isCurrency, type Currency } from '../data/money';

export type Household = {
  id: string;
  name: string;
  main_currency: Currency;
  money_enabled: number;
  share_prices: number;
  role: 'owner' | 'member';
};

export type Profile = { id: string; display_name: string; language: 'ar' | 'en' };

type HouseholdState = { household: Household; profile: Profile | null; ctx: Ctx };

const HouseholdContext = createContext<HouseholdState | null>(null);

/** The user's households and profile, read from the phone's local copy. */
export function useMyHouseholds(userId: string) {
  const households = useQuery<Household>(
    `SELECT h.id, h.name, h.main_currency, h.money_enabled, h.share_prices, m.role
     FROM households h JOIN household_members m ON m.household_id = h.id
     WHERE m.user_id = ? AND h.deleted_at IS NULL
     ORDER BY m.joined_at`,
    [userId]
  );
  const profile = useQuery<Profile>(`SELECT id, display_name, language FROM profiles WHERE id = ?`, [userId]);
  return { households: households.data, profile: profile.data[0] ?? null, loading: households.isLoading };
}

export function HouseholdProvider({
  household,
  profile,
  userId,
  children
}: {
  household: Household;
  profile: Profile | null;
  userId: string;
  children: ReactNode;
}) {
  const mainCurrency: Currency = isCurrency(household.main_currency) ? household.main_currency : 'ILS';
  const ctx: Ctx = {
    householdId: household.id,
    userId,
    mainCurrency,
    moneyEnabled: Boolean(household.money_enabled)
  };
  return (
    <HouseholdContext.Provider value={{ household: { ...household, main_currency: mainCurrency }, profile, ctx }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold(): HouseholdState {
  const value = useContext(HouseholdContext);
  if (!value) throw new Error('useHousehold outside HouseholdProvider');
  return value;
}
