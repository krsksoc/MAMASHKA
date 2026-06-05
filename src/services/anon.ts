import { insertAnonMessage, getPendingAnons, publishAnon, rejectAnon, getMyAnons } from "../data/repos/anon.js";

export function submitAnon(chatId: number, senderId: number, text: string): number {
  return insertAnonMessage(chatId, senderId, text);
}

export function getAnonQueue(chatId: number): Array<{ id: number; text: string; createdAt: string }> {
  return getPendingAnons(chatId).map((a) => ({
    id: a.id,
    text: a.text,
    createdAt: a.createdAt,
  }));
}

export function approveAnon(id: number): void {
  publishAnon(id);
}

export function rejectAnonMessage(id: number): void {
  rejectAnon(id);
}

export function getMyAnonMessages(senderId: number): Array<{ id: number; text: string; status: string; createdAt: string }> {
  return getMyAnons(senderId).map((a) => ({
    id: a.id,
    text: a.text,
    status: a.status,
    createdAt: a.createdAt,
  }));
}