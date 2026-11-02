/**
 * Mock payment is an isolated test capability, never an implicit consequence
 * of running a development build. Both client and server require explicit
 * opt-in so ordinary users cannot receive paid entitlements without payment.
 */
export const PAYMENT_OPERATIONS_AVAILABLE =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_PAYMENTS === 'true';
