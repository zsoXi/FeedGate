# FeedGate 2.x — instrukcja archiwalna (PL)

Aktualny przewodnik dla wersji 3.0.0 znajduje się w pliku [START_TUTAJ_PL.md](START_TUTAJ_PL.md). Ten dokument opisuje starszą wersję 2.1.1 i zostaje wyłącznie jako materiał historyczny.

## 1. Kopia zapasowa przed aktualizacją

1. Zamknij Chrome albo przynajmniej kartę z ustawieniami rozszerzeń.
2. Skopiuj cały folder rozszerzenia (np. `D:\FeedGate-2.1.0`) do kopii
   zapasowej, np. `D:\FeedGate-2.1.0-kopia`.
3. Klucz API i hasło do sejfu nie są częścią folderu — jeśli używasz sejfu,
   zapamiętaj hasło; bez niego zaszyfrowanego klucza nie da się odczytać.

## 2. Aktualizacja i przeładowanie

**Wariant A — ta sama ścieżka (zalecany, zachowuje tożsamość rozszerzenia):**

1. Rozpakuj nową paczkę `FeedGate-2.1.1.zip` tak, aby powstał folder
   `FeedGate-2.1.1`.
2. W Chrome otwórz `chrome://extensions`, włącz „Tryb dewelopera”, znajdź
   FeedGate i kliknij „Odśwież” (ikona ⟳). Ustawienia, klucz i lista
   dozwolonych autorów zostaną zachowane.
3. Uwaga: odświeżenie wczytuje pliki ze starej ścieżki. Jeśli chcesz wczytać
   nowy folder, użyj wariantu B.

**Wariant B — nowy folder (instalacja czysta):**

1. `chrome://extensions` → usuń starą wersję → „Wczytaj rozpakowane” →
   wskaż `FeedGate-2.1.1\extension`.
2. Nowa tożsamość rozszerzenia oznacza pusty magazyn: klucz sesji, sejf,
   listy i wybory „Zachowaj ten post” trzeba wprowadzić od nowa. Nigdy nie
   eksportuj klucza jako zwykłego tekstu, aby to obejść.

**Otwarte karty:** po aktualizacji worker działa od razu, ale stare skrypty
treści na otwartych kartach nie potrafią się dogadać z nowym schematem i
pokazują „Extension updated: reload this page”. Odśwież kartę (F5), aby
wrócić do filtrowania.

## 3. Przełącznik reklam oznaczonych przez platformę

Ustawienia → „Filter policy” → checkbox „Labelled ads”. Wyłączenie tej opcji
sprawia, że żaden lokalny znacznik reklamy nie ukrywa treści; post przechodzi
zwykłą ocenę modelu. Zmiana działa natychmiast, również dla już zwiniętych
postów (zostaną przywrócone). W diagnostyce widać wtedy `labelledAds: false`.

## 4. Eksport diagnostyki

Ustawienia → „04 Diagnostics” → „Export diagnostics”. Powstanie plik
`feedgate-2.1.1-diagnostics-....json`. Plik nie zawiera treści postów, nazw
autorów, adresów URL, klucza API ani zawartości sejfu — tylko decyzje,
liczniki i odcisk wersji (`build`). Dołącz ten plik do zgłoszenia problemu.

## 5. Szybkie sprawdzenie po aktualizacji

1. Otwórz demo: Ustawienia → „Open test feed”.
2. Post z reklamą oznaczoną przez platformę powinien być zwinięty z kartą
   „Platform-labelled ad” i dopiskiem o zweryfikowanym znaczniku.
3. Zwykły post techniczny z linkiem do własnego projektu ma zostać widoczny.
4. W eksporcie diagnostyki sprawdź `build.release: 2.1.1` oraz
   `detector: ad-2.1.1`.
