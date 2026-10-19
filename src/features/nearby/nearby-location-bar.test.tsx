import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_NEARBY_RADIUS, useNearbyLocationStore } from "../../store/nearby-location-store";
import { renderWithProviders } from "../../test/render-with-providers";
import { NearbyLocationBar } from "./nearby-location-bar";

describe("NearbyLocationBar", () => {
  beforeEach(() => {
    useNearbyLocationStore.setState({ location: null, radiusMiles: DEFAULT_NEARBY_RADIUS });
  });

  afterEach(() => {
    cleanup();
  });

  it("invites the user to show nearby items when no location is set", () => {
    const onClick = vi.fn();
    renderWithProviders(<NearbyLocationBar regionLabel="弗吉尼亚" onClick={onClick} />);

    const bar = screen.getByRole("button");
    expect(bar).toHaveTextContent("弗吉尼亚 ·显示附近的二手闲置");
    fireEvent.click(bar);
    expect(onClick).toHaveBeenCalled();
  });

  it("shows the place and the radius once a location is set", () => {
    useNearbyLocationStore.setState({
      location: { latitude: 39.08, longitude: -77.15, label: "Rockville", source: "zip", zip: "20850" },
      radiusMiles: 25
    });
    renderWithProviders(<NearbyLocationBar regionLabel="弗吉尼亚" onClick={vi.fn()} />);

    expect(screen.getByRole("button")).toHaveTextContent("Rockville 附近· 25 英里");
  });
});
