import { createRouter, createWebHistory } from "vue-router";
import FinanceView from "./views/FinanceView.vue";
import DashboardView from "./views/DashboardView.vue";
import CustomerView from "./views/CustomerView.vue";
import AnalyticsView from "./views/AnalyticsView.vue";
import SyncView from "./views/SyncView.vue";
import LoginView from "./views/LoginView.vue";
import SetupView from "./views/SetupView.vue";
import UsersView from "./views/UsersView.vue";
import WorkQueueView from "./views/WorkQueueView.vue";
import UpgradesView from "./views/UpgradesView.vue";
import UpgradeContractView from "./views/UpgradeContractView.vue";
import UpgradePlansView from "./views/UpgradePlansView.vue";
import SettingsView from "./views/SettingsView.vue";
import AppearanceView from "./views/AppearanceView.vue";
import PermissionProfilesView from "./views/PermissionProfilesView.vue";
import SupportView from "./views/SupportView.vue";
import SupportCustomerView from "./views/SupportCustomerView.vue";
import NoAccessView from "./views/NoAccessView.vue";
import { useAuthStore } from "./stores/auth";
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/finance", component: FinanceView, meta: { module: "finance", permission: "finance.dashboard.view" } },
    { path: "/support", component: SupportView, meta: { module: "support", permission: "support.customers.view" } },
    { path: "/support/customers/:id", component: SupportCustomerView, meta: { module: "support", permission: "support.customer.view" } },
    { path: "/support/contracts/:id", component: UpgradeContractView, meta: { module: "support", permission: "support.contract.view" } },
    { path: "/upgrades", component: UpgradesView, meta: { module: "upgrades", permission: "upgrades.opportunities.view" } },
    { path: "/upgrades/contracts/:id", component: UpgradeContractView, meta: { module: "upgrades", permission: "upgrades.contract.view" } },
    { path: "/upgrades/plans", component: UpgradePlansView, meta: { module: "upgrades", permission: "upgrades.plans.view" } },
    { path: "/", component: DashboardView, meta: { permission: "churn.dashboard" } },
    { path: "/customers/:id", component: CustomerView, props: true, meta: { permission: "churn.customer.view" } },
    { path: "/analytics", component: AnalyticsView, meta: { permission: "churn.analytics" } },
    { path: "/attention", component: WorkQueueView, props: { mode: "attention" }, meta: { permission: "churn.attention.view" } },
    { path: "/resolved", component: WorkQueueView, props: { mode: "resolved" }, meta: { permission: "churn.resolved.view" } },
    { path: "/sync", component: SyncView, meta: { permission: "churn.processes.view" } },
    {
      path: "/settings",
      component: SettingsView,
      meta: { module: "settings", admin: true },
      children: [
        { path: "", redirect: "/settings/appearance" },
        { path: "appearance", component: AppearanceView },
        { path: "users", component: UsersView },
        { path: "profiles", component: PermissionProfilesView },
      ],
    },
    { path: "/users", redirect: "/settings/users", meta: { admin: true } },
    { path: "/no-access", component: NoAccessView },
    { path: "/login", component: LoginView, meta: { public: true } },
    { path: "/setup", component: SetupView, meta: { public: true } },
  ],
});
router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const wasInitialized = auth.initialized;
  await auth.initialize();
  if (to.meta.public) return auth.user && to.path === "/login" ? auth.home : true;
  if (wasInitialized && auth.user) await auth.refresh();
  if (!auth.user) return "/login";
  if (to.meta.admin && !auth.isAdmin) return auth.home;
  if (typeof to.meta.permission === "string" && !auth.can(to.meta.permission)) return auth.home;
  return true;
});
export default router;
