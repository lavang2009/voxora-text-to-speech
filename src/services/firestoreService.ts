
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
} from "../types";

/**
 * Save user preferences
 */
export const savePreferences = async (
  uid: string,
  preferences: Preferences
) => {
  await setDoc(
    doc(db, "users", uid),
    {
      preferences,
      updatedAt: serverTimestamp(),
    },
    {
      merge: true,
    }
  );
};

/**
 * Save favorite voice
 */
export const saveFavorite = async (
  uid: string,
  voice: any
) => {
  const cleanVoice = removeUndefinedFields(
    voice
  );

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
 * Remove favorite voice
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
 */
export const getFavorites = async (
  uid: string
) => {
  const snapshot = await getDocs(
    collection(
      db,
      "users",
      uid,
      "favorites"
    )
  );

  return snapshot.docs.map(
    (item) => item.data()
  );
};

/**
 * Add history item
 *
 * Removes all undefined fields before writing
 * to Firestore.
 */
export const addHistory = async (
  uid: string,
  item: Omit<
    HistoryItem,
    "id" | "createdAt"
  >
) => {
  const cleanItem =
    removeUndefinedFields(item);

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
 * Get generation history
 */
export const getHistory = async (
  uid: string
) => {
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
    await getDocs(historyQuery);

  return snapshot.docs.map(
    (document) => {
      const data = document.data();

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
 * Delete history item
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
  voice: any
) => {
  const cleanVoice =
    removeUndefinedFields(
      voice
    );

  await setDoc(
    doc(
      db,
      "users",
      uid,
      "customVoices",
      voice.id
    ),
    {
      ...cleanVoice,
      createdAt:
        serverTimestamp(),
    }
  );
};

/**
 * Get custom voices
 */
export const getCustomVoices = async (
  uid: string
) => {
  const snapshot = await getDocs(
    collection(
      db,
      "users",
      uid,
      "customVoices"
    )
  );

  return snapshot.docs.map(
    (item) => item.data()
  );
};

/**
 * Remove undefined values recursively
 */
function removeUndefinedFields<T>(
  value: T
): T {
  if (Array.isArray(value)) {
    return value.map(
      (item) =>
        removeUndefinedFields(item)
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

    for (const [
      key,
      fieldValue,
    ] of Object.entries(
      value as Record<
        string,
        unknown
      >
    )) {
      if (
        fieldValue === undefined
      ) {
        continue;
      }

      result[key] =
        removeUndefinedFields(
          fieldValue
        );
    }

    return result as T;
  }

  return value;
}