import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getMyTermsAcceptedAt, acceptTerms, signOut } = vi.hoisted(() => ({
  getMyTermsAcceptedAt: vi.fn(),
  acceptTerms: vi.fn(),
  signOut: vi.fn()
}));

vi.mock("../repositories/profiles-repository", () => ({ getMyTermsAcceptedAt, acceptTerms }));
vi.mock("../services/auth/auth-service", () => ({ authService: { signOut } }));

import { useAuthStore } from "../store/auth-store";
import { renderWithProviders } from "../test/render-with-providers";
import { TermsConsentGate } from "./terms-consent-gate";

const initialAuthState = useAuthStore.getState();

function signIn(): void {
  useAuthStore.setState({ session: { user: { id: "user-1" } } as never });
}

describe("TermsConsentGate", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useAuthStore.setState(initialAuthState, true);
    getMyTermsAcceptedAt.mockReset();
    acceptTerms.mockReset();
    signOut.mockReset();
  });

  it("shows nothing when logged out", () => {
    renderWithProviders(<TermsConsentGate />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getMyTermsAcceptedAt).not.toHaveBeenCalled();
  });

  it("shows nothing for a user who already agreed", async () => {
    signIn();
    getMyTermsAcceptedAt.mockResolvedValue("2026-10-20T00:00:00Z");
    renderWithProviders(<TermsConsentGate />);

    await waitFor(() => expect(getMyTermsAcceptedAt).toHaveBeenCalledWith("user-1"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks a user who never agreed, and closes once they agree", async () => {
    signIn();
    getMyTermsAcceptedAt.mockResolvedValue(null);
    acceptTerms.mockResolvedValue("2026-10-20T00:00:00Z");
    renderWithProviders(<TermsConsentGate />);

    const dialog = await screen.findByRole("dialog", { name: "同意用户协议" });
    expect(dialog).toHaveTextContent("零容忍");
    fireEvent.click(screen.getByRole("button", { name: "同意并继续" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(acceptTerms).toHaveBeenCalled();
  });

  it("lets the user decline by logging out", async () => {
    signIn();
    getMyTermsAcceptedAt.mockResolvedValue(null);
    renderWithProviders(<TermsConsentGate />);

    fireEvent.click(await screen.findByRole("button", { name: "不同意，退出登录" }));
    expect(signOut).toHaveBeenCalled();
  });

  it("stays out of the way on the terms page itself", async () => {
    signIn();
    getMyTermsAcceptedAt.mockResolvedValue(null);
    renderWithProviders(<TermsConsentGate />, { initialEntries: ["/terms"] });

    await waitFor(() => expect(getMyTermsAcceptedAt).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
