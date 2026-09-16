"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { COUNTRY_OPTIONS } from "@/config/countries";
import { triggerHaptic } from "@/lib/haptics";

export function CountryPicker({
  selectedCountry,
  onCountryChange,
  isMobile = false,
}: {
  selectedCountry: string;
  onCountryChange: (value: string) => void;
  isMobile?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = COUNTRY_OPTIONS.find((country) => country.code === selectedCountry);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      {isMobile ? (
        <button
          type="button"
          onClick={() => {
            triggerHaptic(10);
            setIsOpen((open) => !open);
          }}
          className="group flex h-9 items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900/80 px-2.5 transition-colors hover:border-neutral-500 active:scale-95 cursor-pointer"
          title={`Country/Region: ${selected?.label ?? selectedCountry}`}
          aria-label="Select Country/Region"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected?.flag ?? "/flags/us.png"}
            alt={selected?.label ?? selectedCountry}
            className="h-3.5 w-5 rounded-sm object-cover"
          />
          <ChevronDown
            className={`h-3 w-3 text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          className="group flex items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 py-2 transition-colors hover:border-neutral-500 cursor-pointer"
          title={selected?.label ?? selectedCountry}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={selected?.flag ?? "/flags/us.png"}
            alt={selected?.label ?? selectedCountry}
            className="h-4 w-6 rounded-sm object-cover"
          />
          <ChevronDown
            className={`h-3.5 w-3.5 text-neutral-500 transition-transform group-hover:text-neutral-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
      )}

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 py-1 shadow-2xl shadow-black/80 max-h-72 overflow-y-auto">
          {COUNTRY_OPTIONS.map((country) => {
            const isSelected = country.code === selectedCountry;
            return (
              <button
                key={country.code}
                type="button"
                onClick={() => {
                  triggerHaptic(10);
                  onCountryChange(country.code);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-white/10 cursor-pointer ${isSelected ? "text-white" : "text-neutral-300"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={country.flag}
                  alt={country.label}
                  className="h-4 w-6 rounded-sm object-cover"
                />
                <span className="flex-1">{country.label}</span>
                {isSelected && <Check className="h-3.5 w-3.5 text-neutral-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
