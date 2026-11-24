import { useLegacyPage } from "./legacy";
import { mountStp, showBranding, showDevices, showPassword } from "./stpKit";

const screens = { branding: showBranding, "change-password": showPassword, "my-devices": showDevices } as const;

/** Settings → Branding / Change Password / My devices (legacy settings-complete stp screens). */
export function StpSettingsPage({ screen }: { screen: keyof typeof screens }) {
  useLegacyPage((el) => {
    void mountStp(el, screens[screen]);
    return () => document.querySelectorAll(".stp-modal-backdrop").forEach((n) => n.remove());
  }, [screen]);
  return null;
}
