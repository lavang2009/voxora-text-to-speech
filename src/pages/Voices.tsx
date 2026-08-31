import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Search,
  Plus,
} from "lucide-react";

import {
  Card,
  Button,
  Input,
  Label,
} from "../components/ui";

import VoiceCard from "../components/VoiceCard";

import {
  useAppStore,
} from "../store/useAppStore";

import {
  listVoices,
} from "../services/ttsService";

import {
  getFavorites,
  removeFavorite,
  saveCustomVoice,
  saveFavorite,
} from "../services/firestoreService";

import type { Voice } from "../types";

export default function Voices() {
  const store = useAppStore();

  const {
    voices,
    setVoices,
    favorites,
    toggleFavorite,
    user,
    setFavorites,
  } = store;

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    language,
    setLanguage,
  ] = useState("all");

  const [
    gender,
    setGender,
  ] = useState("all");

  const [
    customOpen,
    setCustomOpen,
  ] = useState(false);

  const [
    customName,
    setCustomName,
  ] = useState("");

  const [
    customId,
    setCustomId,
  ] = useState("");

  const [
    customProvider,
    setCustomProvider,
  ] = useState("edge");

  /**
   * Load voices.
   */
  useEffect(() => {
    const load = async () => {
      try {
        if (!voices.length) {
          const data =
            await listVoices();

          setVoices(data);
        }

        if (user) {
          const favoriteVoices =
            await getFavorites(
              user.uid
            );

          setFavorites(
            favoriteVoices
          );
        }
      } catch (error) {
        console.error(
          "Voice library error:",
          error
        );
      }
    };

    load();
  }, [
    user,
    voices.length,
    setVoices,
    setFavorites,
  ]);

  /**
   * Filter voices.
   */
  const filteredVoices =
    useMemo(() => {
      return voices.filter(
        (voice) => {
          const matchesSearch =
            !search ||
            `${voice.name} ${voice.locale} ${voice.provider}`
              .toLowerCase()
              .includes(
                search.toLowerCase()
              );

          const matchesLanguage =
            language === "all" ||
            voice.locale ===
              language;

          const matchesGender =
            gender === "all" ||
            voice.gender.toLowerCase() ===
              gender.toLowerCase();

          return (
            matchesSearch &&
            matchesLanguage &&
            matchesGender
          );
        }
      );
    }, [
      voices,
      search,
      language,
      gender,
    ]);

  /**
   * Preview.
   */
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

  /**
   * Favorite.
   */
  const handleFavorite = async (
    voice: Voice
  ) => {
    if (!user) {
      alert(
        "Please sign in to save favorites."
      );
      return;
    }

    try {
      if (favorites[voice.id]) {
        await removeFavorite(
          user.uid,
          voice.id
        );

        toggleFavorite(
          voice
        );
      } else {
        await saveFavorite(
          user.uid,
          voice
        );

        toggleFavorite(
          voice
        );
      }
    } catch (error) {
      console.error(
        "Favorite error:",
        error
      );
    }
  };

  /**
   * Add custom voice.
   */
  const addCustomVoice = async () => {
    if (!user) {
      alert(
        "Please sign in first."
      );
      return;
    }

    if (
      !customName.trim()
    ) {
      alert(
        "Voice name is required."
      );
      return;
    }

    if (
      !customId.trim()
    ) {
      alert(
        "Voice ID is required."
      );
      return;
    }

    const customVoice: Voice = {
      id: customId.trim(),
      name:
        customName.trim(),
      language: "custom",
      locale: "custom",
      gender: "Neutral",
      provider:
        customProvider.trim() ||
        "custom",
      type: "custom",
      isPopular: false,
    };

    try {
      await saveCustomVoice(
        user.uid,
        customVoice
      );

      setVoices([
        ...voices,
        customVoice,
      ]);

      setCustomName("");
      setCustomId("");
      setCustomProvider(
        "edge"
      );

      setCustomOpen(false);
    } catch (error) {
      console.error(
        "Custom voice error:",
        error
      );

      alert(
        "Unable to save custom voice."
      );
    }
  };

  const languages = [
    ...new Set(
      voices.map(
        (voice) =>
          voice.locale
      )
    ),
  ].sort();

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      {/* HEADER */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-violet-300">
            Voice Library
          </p>

          <h1 className="mt-2 text-3xl font-black">
            Find your voice
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Explore voices available
            from the connected TTS
            provider.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() =>
            setCustomOpen(
              (value) => !value
            )
          }
        >
          <Plus size={15} />
          Custom voice
        </Button>
      </div>

      {/* CUSTOM VOICE */}
      {customOpen && (
        <Card className="mt-5 p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label>
                Voice name
              </Label>

              <Input
                value={customName}
                onChange={(event) =>
                  setCustomName(
                    event.target.value
                  )
                }
                placeholder="My Voice"
              />
            </div>

            <div>
              <Label>
                Voice ID
              </Label>

              <Input
                value={customId}
                onChange={(event) =>
                  setCustomId(
                    event.target.value
                  )
                }
                placeholder="voice-id"
              />
            </div>

            <div>
              <Label>
                Provider
              </Label>

              <Input
                value={customProvider}
                onChange={(event) =>
                  setCustomProvider(
                    event.target.value
                  )
                }
                placeholder="edge"
              />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <Button
              onClick={
                addCustomVoice
              }
            >
              Save custom voice
            </Button>
          </div>
        </Card>
      )}

      {/* FILTER */}
      <Card className="mt-5 grid gap-3 p-4 md:grid-cols-[1fr_180px_150px]">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-3.5 text-slate-500"
          />

          <Input
            className="pl-9"
            placeholder="Search voices..."
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
          />
        </div>

        <select
          className="rounded-xl bg-slate-900 p-3"
          value={language}
          onChange={(event) =>
            setLanguage(
              event.target.value
            )
          }
        >
          <option value="all">
            All languages
          </option>

          {languages.map(
            (locale) => (
              <option
                key={locale}
                value={locale}
              >
                {locale}
              </option>
            )
          )}
        </select>

        <select
          className="rounded-xl bg-slate-900 p-3"
          value={gender}
          onChange={(event) =>
            setGender(
              event.target.value
            )
          }
        >
          <option value="all">
            All genders
          </option>

          <option value="male">
            Male
          </option>

          <option value="female">
            Female
          </option>

          <option value="neutral">
            Neutral
          </option>
        </select>
      </Card>

      {/* VOICES */}
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filteredVoices.map(
          (voice) => (
            <VoiceCard
              key={voice.id}
              voice={voice}
              fav={
                !!favorites[
                  voice.id
                ]
              }
              onFavorite={() =>
                handleFavorite(
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

      {!filteredVoices.length && (
        <Card className="mt-5 p-12 text-center text-sm text-slate-500">
          No voices found.
        </Card>
      )}
    </div>
  );
}
