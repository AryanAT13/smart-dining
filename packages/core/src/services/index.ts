/**
 * Service barrel — the canonical import surface for everything domain-level.
 *
 * Convention: routes and gateway handlers import from `@smart-dining/core/services`
 * (not from individual subdirs) so we have a single place to govern public API.
 */

export {
  MenuService,
  menuService,
  toMenuItemView,
  type MenuItemView,
  type MenuFilters,
  type SemanticSearchOptions,
  type SemanticMatch,
  type ComplementarySuggestion,
} from './menu/index.js';

export { SessionService, sessionService, type SessionView } from './session/index.js';

export {
  CartService,
  cartService,
  type CartView,
  type CartLine,
  type AddItemInput,
  type UpdateItemInput,
} from './cart/index.js';

export {
  OtpService,
  otpService,
  MockOtpProvider,
  TwilioOtpProvider,
  type OtpProvider,
  type SendOtpResult,
  type VerifiedOtp,
} from './otp/index.js';

export {
  OrderService,
  orderService,
  type OrderView,
  type OrderLineView,
  type PlaceOrderInput,
} from './order/index.js';
