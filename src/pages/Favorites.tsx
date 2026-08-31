
import {
  useEffect,
} from "react";

import {
  Card,
} from "../components/ui";

import VoiceCard from "../components/VoiceCard";

import {
  useAppStore,
} from "../store/useAppStore";

import {
  getFavorites,
  removeFavorite,
} from "../services/firestoreService";

import type { Voice } from "../types";

export default function Favorites() {
  const user =
    useAppStore(
      (state) => state.user
    );

  const favorites =
    useAppStore(
      (state) => state.favorites
    );

  const setFavorites =
    useAppStore(
      (state) =>
        state.setFavorites
    );

  const toggleFavorite =
    useAppStore(
      (state) =>
        state.toggleFavorite
    );

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    const loadFavorites =
      async () => {
        try {
          const data =
            await getFavorites(
              user.uid
            );

          if (!cancelled) {
            setFavorites(data);
          }
        } catch (error) {
          console.error(
            "Favorites loading error:",
            error
          );
        }
      };

    loadFavorites();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    setFavorites,
  ]);

  const favoriteVoices =
    Object.values(
      favorites
    ) as Voice[];

  const preview = (
    voice: Voice
  ) => {
    const utterance =
      new SpeechSynthesisUtterance(
        `This is ${voice.name}.`
      );

    utterance.lang =
      voice.locale;

    speechSynthesis.cancel();

    speechSynthesis.speak(
      utterance
    );
  };

  const handleRemove =
    async (voice: Voice) => {
      if (!user) {
        return;
      }

      try {
        await removeFavorite(
          user.uid,
          voice.id
        );

        toggleFavorite(
          voice
        );
      } catch (error) {
        console.error(
          "Remove favorite error:",
          error
        );
      }
    };

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <p className="text-xs uppercase tracking-widest text-violet-300">
        Favorites
      </p>

      <h1 className="mt-2 text-3xl font-black">
        Favorite voices
      </h1>

      {favoriteVoices.length >
      0 ? (
        <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {favoriteVoices.map(
            (voice) => (
              <VoiceCard
                key={voice.id}
                voice={voice}
                fav={true}
                onFavorite={() =>
                  handleRemove(
                    voice
                  )
                }
                onPreview={() =>
                  preview(
                    voice
                  )
                }
              />
            )
          )}
        </div>
      ) : (
        <Card className="mt-7 p-12 text-center text-slate-500">
          No favorite voices yet.
        </Card>
      )}
    </div>
  );
}
