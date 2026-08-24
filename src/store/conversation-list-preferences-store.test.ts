import { beforeEach, describe, expect, it } from "vitest";

import { useConversationListPreferencesStore } from "./conversation-list-preferences-store";

const initialState = useConversationListPreferencesStore.getState();

beforeEach(() => {
  useConversationListPreferencesStore.setState(initialState, true);
  localStorage.clear();
});

describe("useConversationListPreferencesStore", () => {
  it("starts with no manually-unread/hidden/deleted conversation ids", () => {
    const state = useConversationListPreferencesStore.getState();
    expect(state.manuallyUnreadIds).toEqual({});
    expect(state.hiddenConversationIds).toEqual({});
    expect(state.deletedConversationIds).toEqual({});
  });

  it("markAsUnread adds the conversation id", () => {
    useConversationListPreferencesStore.getState().markAsUnread("conv-1");

    expect(useConversationListPreferencesStore.getState().manuallyUnreadIds).toEqual({
      "conv-1": true
    });
  });

  it("clearManualUnread removes the conversation id, leaving other entries untouched", () => {
    useConversationListPreferencesStore.getState().markAsUnread("conv-1");
    useConversationListPreferencesStore.getState().markAsUnread("conv-2");

    useConversationListPreferencesStore.getState().clearManualUnread("conv-1");

    expect(useConversationListPreferencesStore.getState().manuallyUnreadIds).toEqual({
      "conv-2": true
    });
  });

  it("clearManualUnread on an id that was never marked is a harmless no-op", () => {
    useConversationListPreferencesStore.getState().clearManualUnread("conv-never-marked");

    expect(useConversationListPreferencesStore.getState().manuallyUnreadIds).toEqual({});
  });

  it("hideConversation adds the conversation id to hiddenConversationIds only", () => {
    useConversationListPreferencesStore.getState().hideConversation("conv-1");

    const state = useConversationListPreferencesStore.getState();
    expect(state.hiddenConversationIds).toEqual({ "conv-1": true });
    expect(state.deletedConversationIds).toEqual({});
  });

  it("deleteConversation adds the conversation id to deletedConversationIds only", () => {
    useConversationListPreferencesStore.getState().deleteConversation("conv-1");

    const state = useConversationListPreferencesStore.getState();
    expect(state.deletedConversationIds).toEqual({ "conv-1": true });
    expect(state.hiddenConversationIds).toEqual({});
  });

  it("persists all three sets to localStorage under the saminest-prefixed key", () => {
    useConversationListPreferencesStore.getState().markAsUnread("conv-1");
    useConversationListPreferencesStore.getState().hideConversation("conv-2");
    useConversationListPreferencesStore.getState().deleteConversation("conv-3");

    const raw = localStorage.getItem("saminest-conversation-list-preferences");
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw as string).state;
    expect(persisted.manuallyUnreadIds).toEqual({ "conv-1": true });
    expect(persisted.hiddenConversationIds).toEqual({ "conv-2": true });
    expect(persisted.deletedConversationIds).toEqual({ "conv-3": true });
  });
});
