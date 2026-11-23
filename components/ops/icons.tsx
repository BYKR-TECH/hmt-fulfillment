import {
  AlertTriangle, Home, List, PackagePlus, Receipt, Route, Settings, ShoppingCart, Truck, Zap, type LucideIcon
} from 'lucide-react';

export const NAV_ICONS: Record<string, LucideIcon> = {
  home: Home,
  'package-plus': PackagePlus,
  truck: Truck,
  alert: AlertTriangle,
  list: List,
  route: Route,
  cart: ShoppingCart,
  receipt: Receipt,
  bolt: Zap,
  settings: Settings
};
