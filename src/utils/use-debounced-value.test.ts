import { renderHook } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useDebouncedValue } from "./use-debounced-value";

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("a", 400));

    expect(result.current).toBe("a");
  });

  it("does not update the debounced value before delayMs has elapsed", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 400),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "b" });
    act(() => {
      vi.advanceTimersByTime(399);
    });

    expect(result.current).toBe("a");
  });

  it("updates the debounced value after delayMs of no further changes", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 400),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "b" });
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(result.current).toBe("b");
  });

  it("resets the timer on every change, only settling on the latest value", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 400),
      { initialProps: { value: "a" } }
    );

    rerender({ value: "b" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ value: "c" });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Only 200ms since the latest change ("c") — should still be the old value.
    expect(result.current).toBe("a");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe("c");
  });
});
