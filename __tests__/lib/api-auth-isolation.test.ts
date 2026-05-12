import {
  requireRole,
  requireDealerResource,
  requireUserResource,
  dealerScopeWhere,
  userScopeWhere,
} from '@/lib/api-auth';

const sessionAdmin = {
  user: { id: 'admin-1', role: 'ADMIN', email: 'admin@test.com' },
} as any;
const sessionDealerA = {
  user: { id: 'dealer-a', role: 'DEALER', email: 'a@test.com' },
} as any;
const sessionDealerB = {
  user: { id: 'dealer-b', role: 'DEALER', email: 'b@test.com' },
} as any;
const sessionCustomer = {
  user: { id: 'customer-1', role: 'CUSTOMER', email: 'c@test.com' },
} as any;

describe('api-auth isolation (tenant / dealer scope)', () => {
  describe('requireRole', () => {
    it('allows ADMIN for admin routes', () => {
      expect(requireRole(sessionAdmin, ['ADMIN'])).toBeNull();
    });
    it('returns 403 when DEALER accesses ADMIN-only', () => {
      const res = requireRole(sessionDealerA, ['ADMIN']);
      expect(res).not.toBeNull();
      expect(res?.status).toBe(403);
    });
    it('allows DEALER for dealer routes', () => {
      expect(requireRole(sessionDealerA, ['DEALER'])).toBeNull();
    });
  });

  describe('requireDealerResource', () => {
    it('allows ADMIN to access any dealer resource', () => {
      expect(requireDealerResource(sessionAdmin, 'dealer-a')).toBeNull();
      expect(requireDealerResource(sessionAdmin, 'dealer-b')).toBeNull();
    });
    it('allows DEALER to access only own resource', () => {
      expect(requireDealerResource(sessionDealerA, 'dealer-a')).toBeNull();
    });
    it('returns 403 when dealer A accesses dealer B resource', () => {
      const res = requireDealerResource(sessionDealerA, 'dealer-b');
      expect(res).not.toBeNull();
      expect(res?.status).toBe(403);
    });
    it('returns 403 when CUSTOMER accesses dealer resource', () => {
      const res = requireDealerResource(sessionCustomer, 'dealer-a');
      expect(res).not.toBeNull();
      expect(res?.status).toBe(403);
    });
  });

  describe('requireUserResource', () => {
    it('allows ADMIN to access any user resource', () => {
      expect(requireUserResource(sessionAdmin, 'customer-1')).toBeNull();
    });
    it('allows user to access own resource', () => {
      expect(requireUserResource(sessionCustomer, 'customer-1')).toBeNull();
    });
    it('returns 403 when user A accesses user B resource', () => {
      const res = requireUserResource(sessionCustomer, 'other-user-id');
      expect(res).not.toBeNull();
      expect(res?.status).toBe(403);
    });
  });

  describe('dealerScopeWhere', () => {
    it('returns empty object for ADMIN (can query all)', () => {
      expect(dealerScopeWhere(sessionAdmin)).toEqual({});
    });
    it('returns dealerId for DEALER so dealer A cannot see dealer B data', () => {
      expect(dealerScopeWhere(sessionDealerA)).toEqual({ dealerId: 'dealer-a' });
      expect(dealerScopeWhere(sessionDealerB)).toEqual({ dealerId: 'dealer-b' });
    });
  });

  describe('userScopeWhere', () => {
    it('returns empty object for ADMIN', () => {
      expect(userScopeWhere(sessionAdmin)).toEqual({});
    });
    it('returns userId for CUSTOMER so customer cannot see other customer data', () => {
      expect(userScopeWhere(sessionCustomer)).toEqual({ userId: 'customer-1' });
    });
  });
});
