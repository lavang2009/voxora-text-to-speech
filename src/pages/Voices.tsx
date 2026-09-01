import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Search,
  Plus,
  Heart,
  Play,
  Star,
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

type GenderFilter =
  | "all"
  | "Male"
  | "Female"
  | "Neutral";

type CategoryFilter =
  | "all"
  | "popular"
  | "favorites";

export default function Voices() {
  const user =
    useAppStore(
      (state) => state.user
    );

  const voices =
    useAppStore(
      (state) => state.voices
    );

  const favorites =
    useAppStore(
      (state) => state.favorites
    );

  const setVoices =
    useAppStore(
      (state) =>
        state.setVoices
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
  ] = useState<GenderFilter>(
    "all"
  );

  const [
    category,
    setCategory,
  ] = useState<CategoryFilter>(
    "all"
  );

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
  ] = useState(
    "custom"
  );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");

  /*
   * Load voices from backend.
   */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        if (
          voices.length === 0
        ) {
          const data =
            await listVoices();

          if (!cancelled) {
            setVoices(
              Array.isArray(data)
                ? data
                : []
            );
          }
        }

        if (user) {
          const favoriteData =
            await getFavorites(
              user.uid
            );

          if (!cancelled) {
            setFavorites(
              Array.isArray(
                favoriteData
              )
                ? favoriteData
                : []
            );
          }
        }
      } catch (err) {
        console.error(
          "Voice library error:",
          err
        );

        if (!cancelled) {
          setError(
            "Unable to load the voice library."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    voices.length,
    setVoices,
    setFavorites,
  ]);

  /*
   * All available languages.
   */
  const languages =
    useMemo(() => {
      return [
        ...new Set(
          voices.map(
            (voice) =>
              voice.locale
          )
        ),
      ].sort((a, b) => {
        if (
          a === "vi-VN"
        ) {
          return -1;
        }

        if (
          b === "vi-VN"
        ) {
          return 1;
        }

        if (
          a === "en-US"
        ) {
          return -1;
        }

        if (
          b === "en-US"
        ) {
          return 1;
        }

        return a.localeCompare(
          b
        );
      });
    }, [voices]);

  /*
   * Filter real provider voices.
   */
  const filteredVoices =
    useMemo(() => {
      const q =
        search
          .trim()
          .toLowerCase();

      const result =
        voices.filter(
          (voice) => {
            const matchesSearch =
              !q ||
              `${voice.name} ${voice.id} ${voice.locale} ${voice.provider}`
                .toLowerCase()
                .includes(q);

            const matchesLanguage =
              language ===
                "all" ||
              voice.locale ===
                language;

            const matchesGender =
              gender ===
                "all" ||
              voice.gender ===
                gender;

            const matchesCategory =
              category === "all"
                ? true
                : category ===
                    "popular"
                  ? voice.isPopular ===
                    true
                  : Boolean(
                      favorites[
                        voice.id
                      ]
                    );

            return (
              matchesSearch &&
              matchesLanguage &&
              matchesGender &&
              matchesCategory
            );
          }
        );

      return result.sort(
        (a, b) => {
          if (
            Boolean(
              a.isPopular
            ) !==
            Boolean(
              b.isPopular
            )
          ) {
            return a.isPopular
              ? -1
              : 1;
          }

          if (
            a.locale ===
              "vi-VN" &&
            b.locale !==
              "vi-VN"
          ) {
            return -1;
          }

          if (
            b.locale ===
              "vi-VN" &&
            a.locale !==
              "vi-VN"
          ) {
            return 1;
          }

          return (
            `${a.locale}-${a.name}`
          ).localeCompare(
            `${b.locale}-${b.name}`
          );
        }
      );
    }, [
      voices,
      search,
      language,
      gender,
      category,
      favorites,
    ]);

  /*
   * Preview.
   */
  const preview = (
    voice: Voice
  ) => {
    const utterance =
      new SpeechSynthesisUtterance(
        `Hello. This is ${voice.name}.`
      );

    utterance.lang =
      voice.locale;

    speechSynthesis.cancel();

    speechSynthesis.speak(
      utterance
    );
  };

  /*
   * Favorites.
   */
  const handleFavorite =
    async (
      voice: Voice
    ) => {
      if (!user) {
        setError(
          "Please sign in to save favorites."
        );

        return;
      }

      try {
        const isFavorite =
          Boolean(
            favorites[
              voice.id
            ]
          );

        if (isFavorite) {
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
      } catch (err) {
        console.error(
          "Favorite error:",
          err
        );

        setError(
          "Unable to update favorite."
        );
      }
    };

  /*
   * Save custom voice.
   */
  const addCustomVoice =
    async () => {
      if (!user) {
        setError(
          "Please sign in first."
        );
        return;
      }

      const name =
        customName.trim();

      const id =
        customId.trim();

      const provider =
        customProvider.trim() ||
        "custom";

      if (!name) {
        setError(
          "Voice name is required."
        );
        return;
      }

      if (!id) {
        setError(
          "Voice ID is required."
        );
        return;
      }

      const customVoice: Voice =
        {
          id,

          name,

          language:
            "custom",

          locale:
            "custom",

          gender:
            "Neutral",

          provider,

          type:
            "custom",

          isPopular:
            false,
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
          "custom"
        );

        setCustomOpen(
          false
        );

        setError("");
      } catch (err) {
        console.error(
          "Custom voice error:",
          err
        );

        setError(
          "Unable to save custom voice."
        );
      }
    };

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
            Browse voices provided by
            your connected TTS
            engines.
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() =>
            setCustomOpen(
              (value) =>
                !value
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
                    event.target
                      .value
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
                    event.target
                      .value
                  )
                }
                placeholder="provider voice ID"
              />
            </div>

            <div>
              <Label>
                Provider
              </Label>

              <Input
                value={
                  customProvider
                }
                onChange={(event) =>
                  setCustomProvider(
                    event.target
                      .value
                  )
                }
                placeholder="provider name"
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

      {/* ERROR */}
      {error && (
        <div className="mt-5 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* FILTERS */}
      <Card className="mt-5 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_160px_160px]">

          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-3.5 text-slate-500"
            />

            <Input
              className="pl-9"
              placeholder="Search voice, provider or ID..."
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
            />
          </div>

          <select
            className="rounded-xl border border-white/10 bg-slate-900 p-3 text-sm"
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
            className="rounded-xl border border-white/10 bg-slate-900 p-3 text-sm"
            value={gender}
            onChange={(event) =>
              setGender(
                event.target
                  .value as GenderFilter
              )
            }
          >
            <option value="all">
              All genders
            </option>

            <option value="Male">
              Male
            </option>

            <option value="Female">
              Female
            </option>

            <option value="Neutral">
              Neutral
            </option>
          </select>

          <select
            className="rounded-xl border border-white/10 bg-slate-900 p-3 text-sm"
            value={category}
            onChange={(event) =>
              setCategory(
                event.target
                  .value as CategoryFilter
              )
            }
          >
            <option value="all">
              All voices
            </option>

            <option value="popular">
              Popular
            </option>

            <option value="favorites">
              Favorites
            </option>
          </select>
        </div>
      </Card>

      {/* SUMMARY */}
      <div className="mt-5 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-slate-500">
          {category ===
            "popular" && (
            <Star
              size={15}
              className="text-amber-300"
            />
          )}

          {filteredVoices.length}{" "}
          voices shown
        </div>

        <div className="text-xs text-slate-600">
          {voices.length} total
        </div>
      </div>

      {/* GRID */}
      {loading &&
      voices.length === 0 ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({
            length: 6,
          }).map((_, index) => (
            <Card
              key={index}
              className="h-44 animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredVoices.map(
            (voice) => (
              <div
                key={voice.id}
                className="relative"
              >
                <VoiceCard
                  voice={voice}
                  fav={
                    Boolean(
                      favorites[
                        voice.id
                      ]
                    )
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

                {/* Extra provider metadata */}
                <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center justify-between text-[10px] text-slate-600">
                  <span className="truncate">
                    {voice.provider}
                  </span>

                  <span className="ml-2 shrink-0">
                    {voice.locale}
                  </span>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {/* EMPTY */}
      {!loading &&
        filteredVoices.length ===
          0 && (
          <Card className="mt-5 p-12 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/5">
              <Search
                size={20}
                className="text-slate-500"
              />
            </div>

            <h3 className="mt-4 font-semibold">
              No voices found
            </h3>

            <p className="mt-2 text-sm text-slate-500">
              Try another language,
              gender or search
              term.
            </p>

            <button
              type="button"
              onClick={() => {
                setSearch("");
                setLanguage("all");
                setGender("all");
                setCategory("all");
              }}
              className="mt-4 text-sm text-violet-300 hover:text-violet-200"
            >
              Clear filters
            </button>
          </Card>
        )}
    </div>
  );
}
