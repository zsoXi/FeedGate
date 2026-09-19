# FeedGate 3.0.0 — start tutaj (PL)

Ten plik to krótki przewodnik po wersji 3.0.0. Pełniejsze, starsze instrukcje po
polsku są w [INSTRUKCJA_PL.md](INSTRUKCJA_PL.md); dokumentacja techniczna jest
po angielsku w katalogu `docs/`.

## 1. Zanim zaczniesz

* Zrób kopię zapasową obecnego katalogu FeedGate (np. `FeedGate-2.1.1`).
* Nigdy nie usuwaj starego katalogu „na naprawę” — najpierw eksportuj ustawienia.
* Rozszerzenia nie trzeba przeinstalowywać, jeśli podmieniasz pliki w tej samej
  ścieżce. Wtedy Chrome zachowuje tożsamość rozszerzenia, a klucz i sejf działają
  dalej. Inny katalog = nowa tożsamość i nowe uprawnienia.

## 2. Aktualizacja do 3.0.0

1. Rozpakuj wydanie do docelowego katalogu (np. `D:\FeedGate-3.0.0`).
2. `chrome://extensions` → tryb programisty → **Załaduj rozpakowane** → wskaż
   katalog `extension` z plikiem `manifest.json`.
3. Przy pierwszym starcie po aktualizacji pojawi się jednorazowy pasek
   „Select all six supported feeds”. Możesz wybrać wszystkie sześć serwisów
   jednym oknem zgody Chrome albo zachować obecne ustawienie.
4. Karty otwarte przed aktualizacją pokażą „Extension updated: reload this page”.
   Odśwież je (F5). FeedGate nie filtruje stron starą wersją skryptu.
5. Stare reguły CSS z wersji 2.x trafiają do kwarantanny (`legacy_unvalidated`).
   Nie ukrywają nic, dopóki nie zostaną sprawdzone na prawdziwym elemencie.

## 3. Codzienne użycie

* **Pigułka statusu** (lewy dolny róg) — kliknij, aby rozwinąć panel.
  * „–” zwija z powrotem do pigułki.
  * „×” ukrywa panel całkowicie. **Ukrycie panelu nie pauzuje filtrowania.**
  * Tryb wybierzesz też w Ustawieniach (compact / expanded / hidden) oraz w
    oknie popup.
* **Pauza** zatrzymuje filtrowanie na wszystkich stronach. Ukryty panel nie
  zmienia tego stanu — sprawdzisz go w popupie.
* **Show** przywraca pojedynczy post na tej stronie. **Keep this post** zapamiętuje
  wyjątek dla tego konkretnego posta. **Allow author** wyłącza autora w obrębie
  serwisu. **Alt + Shift + F** pokazuje lub ponownie filtruje całą stronę.

## 4. Własne filtry kosmetyczne (bezpieczne)

1. W popupie kliknij **Pick element**.
2. Najedź na element — zobaczysz podgląd: zasięg (host), selektor, liczbę
   pasujących elementów i informację, co zostałoby ukryte.
3. Kliknij **Create rule** (albo **Cancel** / Escape).
4. Po zapisaniu masz 15 sekund na **Undo**; później **Undo deletion** znajdziesz
   w Ustawieniach → My cosmetic filters.

FeedGate odmówi, gdy cel jest zbyt szeroki: korzeń strony, nawigacja, główna
kolumna treści, kontener wielu elementów albo własny interfejs FeedGate.
Wybrany element nie staje się „postem” dla modelu — to wyłącznie lokalne ukrycie.

## 5. Naprawa strony (recovery)

* **Restore this site** — najpierw trwale zapisuje pauzę dla serwisu, potem
  prosi otwarte karty o usunięcie efektów. Jeśli karta nie odpowie, pauza i tak
  obowiązuje; użyj **Reload this tab with filtering paused** (ostrzeżenie:
  niezapisane dane w formularzach przepadną).
* **Disable cosmetic filters** — wyłącza stosowanie reguł, ale zachowuje ich
  listę, klucz i pozostałe ustawienia.
* **Resume this site** — wznawia filtrowanie; aplikacja ostrzeże, ile reguł
  nadal czeka w kwarantannie.

## 6. Diagnostyka i kopie

* **Export diagnostics** tworzy plik
  `feedgate-3.0.0-diagnostics-….json` bez kluczy, tekstów postów, autorów,
  pełnych adresów URL i surowych selektorów. Zawiera m.in. sekcje `ui`, `sites`,
  `cosmetic`, `renderer` i `provider` oraz odcisk wersji (`build`).
* **Export settings** zapisuje ustawienia w formacie wersji 4 (z regułami
  kosmetycznymi — to Twoja lokalna kopia). Import akceptuje też formaty 2.x;
  niezweryfikowane reguły stają się kwarantanną.

## 7. Szybka lista kontrolna po aktualizacji

1. Otwórz testowy kanał (Demo feed) — powinien pojawić się jeden lokalny
   zwinięty post z opisem zweryfikowanej etykiety platformy.
2. Otwórz zwykły post techniczny — ma pozostać widoczny.
3. Sprawdź w pasku statusu, że tryb to „Running”, a w popupie, że sześć
   serwisów ma stan „ready”.
4. W eksporcie diagnostyki sprawdź `build.release` = `3.0.0` oraz
   `build.detector` = `ad-3.0.0`.

## 8. Czego 3.0.0 świadomie nie robi

* Nie zmienia progów kategorii ani modelu — to wydanie o kontroli, nie o
  skuteczności modelu.
* Nie blokuje reklam sieciowych, nie skanuje obrazów, nie otwiera stron
  docelowych i nie zbiera historii przeglądania.
* Wykop pozostaje w wersji beta: oznaczenia reklamowe Wykopu nie mają dziś
  zweryfikowanego markera, więc miejsca promowane nie są lokalnie ukrywane.

Walidacja na żywym kluczu TypeSafe i zalogowanych serwisach nie została
wykonana w tym wydaniu — wszystkie testy korzystają z fixture'ów.
