
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import { db } from "../lib/firebase";

import type {
  HistoryItem,
  Preferences,
  Voice,
} from "../types";

function removeUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) =>
      removeUndefined(item)
    ) as T;
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    const result: Record<
      string,
      unknown
    > = {};

    for (const [key, item] of Object.entries(
      value as Record<string, unknown>
    )) {
      if (item === undefined) {
        continue;
      }

      result[key] = removeUndefined(item);
    }

    return result as T;
  }

  return value;
}

function toVoice(data: Record<string, any>): Voice {
  const gender: Voice["gender"] =
    data.gender === "Male" ||
    data.gender === "Female" ||
    data.gender === "Neutral"
      ? data.gender
      : "Neutral";

  return {
    id: String(data.id ?? ""),
    name: String(
      data.name ?? "Unknown Voice"
    ),
    language: String(
      data.language ??
        data.locale ??
        ""
    ),
    locale: String(
      data.locale ?? ""
    ),
    gender,
    provider: String(
      data.provider ?? "Unknown"
    ),
    type: String(
      data.type ?? "custom"
    ),
    friendlyName:
      data.friendlyName !== undefined
        ? String(data.friendlyName)
        : undefined,
    isPopular:
      typeof data.isPopular ===
      "boolean"
        ? data.isPopular
        : false,
  };
}

/**
 * Save preferences
 */
export const savePreferences = async (
  uid: string,
  preferences: Preferences
) => {
  await setDoc(
    doc(db, "users", uid),
    {
      preferences: removeUndefined(
        preferences
      ),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
};

/**
 * Save favorite
 */
export const saveFavorite = async (
  uid: string,
  voice: Voice
) => {
  const cleanVoice =
    removeUndefined(voice);

  await setDoc(
    doc(
      db,
      "users",
      uid,
      "favorites",
      voice.id
    ),
    {
      ...cleanVoice,
      createdAt: serverTimestamp(),
    }
  );
};

/**
 * Remove favorite
 */
export const removeFavorite = async (
  uid: string,
  voiceId: string
) => {
  await deleteDoc(
    doc(
      db,
      "users",
      uid,
      "favorites",
      voiceId
    )
  );
};

/**
 * Get favorites
 *
 * Explicitly returns Voice[]
 * to prevent DocumentData[] errors.
 */
export const getFavorites = async (
  uid: string
): Promise<Voice[]> => {
  const snapshot = await getDocs(
    collection(
      db,
      "users",
      uid,
      "favorites"
    )
  );

  return snapshot.docs.map(
    (item) =>
      toVoice(item.data())
  );
};

/**
 * Add history
 */
export const addHistory = async (
  uid: string,
  item: Omit<
    HistoryItem,
    "id" | "createdAt"
  >
) => {
  const cleanItem =
    removeUndefined(item);

  const ref = await addDoc(
    collection(
      db,
      "users",
      uid,
      "history"
    ),
    {
      ...cleanItem,
      createdAt: serverTimestamp(),
    }
  );

  return ref.id;
};

/**
 * Get history
 */
export const getHistory = async (
  uid: string
): Promise<HistoryItem[]> => {
  const historyQuery = query(
    collection(
      db,
      "users",
      uid,
      "history"
    ),
    orderBy(
      "createdAt",
      "desc"
    ),
    limit(50)
  );

  const snapshot =
    await getDocs(
      historyQuery
    );

  return snapshot.docs.map(
    (document) => {
      const data =
        document.data();

      let createdAt =
        new Date().toISOString();

      if (
        data.createdAt &&
        typeof data.createdAt.toDate ===
          "function"
      ) {
        createdAt =
          data.createdAt
            .toDate()
            .toISOString();
      }

      return {
        id: document.id,
        ...data,
        createdAt,
      } as HistoryItem;
    }
  );
};

/**
 * Delete history
 */
export const deleteHistory = async (
  uid: string,
  historyId: string
) => {
  await deleteDoc(
    doc(
      db,
      "users",
      uid,
      "history",
      historyId
    )
  );
};

/**
 * Save custom voice
 */
export const saveCustomVoice = async (
  uid: string,
  voice: Voice
) => {
  await setDoc(
    doc(
      db,
      "users",
      uid,
      "customVoices",
      voice.id
    ),
    {
      ...removeUndefined(voice),
      createdAt: serverTimestamp(),
    }
  );
};

/**
 * Get custom voices
 */
export const getCustomVoices = async (
  uid: string
): Promise<Voice[]> => {
  const snapshot = await getDocs(
    collection(
      db,
      "users",
      uid,
      "customVoices"
    )
  );

  return snapshot.docs.map(
    (item) =>
      toVoice(item.data())
  );
};
