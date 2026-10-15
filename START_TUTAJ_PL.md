# FeedGate 3.3.0: start tutaj (PL)

Ten plik to krótki przewodnik po wersji 3.3.0. Pełniejsze, starsze instrukcje po
polsku są w [INSTRUKCJA_PL.md](INSTRUKCJA_PL.md); dokumentacja techniczna jest
po angielsku w katalogu `docs/`.

## 1. Zanim zaczniesz

* Zrób kopię zapasową obecnego katalogu FeedGate (np. `FeedGate-3.1.0`).
* Nigdy nie usuwaj starego katalogu „na naprawę”. Najpierw eksportuj ustawienia.
* Od 3.2.0 rozszerzenie ma **stałą tożsamość** (klucz publiczny w manifeście), więc
  klucz, sejf i ustawienia przeżywają aktualizacje i przenosiny katalogu. Zalecana
  aktualizacja to podmiana plików w tym samym katalogu i **Reload** w
  `chrome://extensions`. Nigdy **Remove**.

## 2. Aktualizacja do 3.3.0 (w miejscu)

1. Zrób kopię zapasową katalogu i (jeśli to możliwe) wyeksportuj ustawienia.
2. Skopiuj nowe pliki wydania (zawartość katalogu `extension/`) na te w tym samym
   katalogu, z którego działa obecna wersja.
3. `chrome://extensions` → **Reload** (odświeżenie). **Nie klikaj Remove**:
   usunięcie kasuje też lokalne dane rozszerzenia.
4. Od 3.2.0 tożsamość rozszerzenia jest stała, więc sejf, klucz, listy i ustawienia
   przechodzą aktualizację automatycznie. Nie wpisujesz klucza ponownie. (Jednorazowa
   zmiana tożsamości dotyczyła tylko przejścia ze starszej wersji na 3.2.0.)
5. Karty otwarte przed aktualizacją pokażą „Extension updated: reload this page”.
   Odśwież je (F5). FeedGate nie filtruje stron starą wersją skryptu.
6. Stare reguły CSS z wersji 2.x trafiają do kwarantanny (`legacy_unvalidated`).
   Nie ukrywają nic, dopóki nie zostaną sprawdzone na prawdziwym elemencie.
7. Wejdź w Ustawienia → **06 Updates** i kliknij **Check files on disk**. Panel
   porówna działającą wersję z plikami w katalogu i pokaże „Up to date”.

## 3. Codzienne użycie

* **Pigułka statusu** (lewy dolny róg): kliknij, aby rozwinąć panel.
  * „–” zwija z powrotem do pigułki.
  * „×” ukrywa panel całkowicie. **Ukrycie panelu nie pauzuje filtrowania.**
  * Tryb wybierzesz też w Ustawieniach (compact / expanded / hidden) oraz w
    oknie popup.
* **Pauza** zatrzymuje filtrowanie na wszystkich stronach. Ukryty panel nie
  zmienia tego stanu. Sprawdzisz go w popupie.
* **Show** przywraca pojedynczy post na tej stronie. **Keep this post** zapamiętuje
  wyjątek dla tego konkretnego posta. **Allow author** wyłącza autora w obrębie
  serwisu. **Alt + Shift + F** pokazuje lub ponownie filtruje całą stronę.
* **Mute author** (obok „Allow author” na karcie posta) ukrywa wszystkie posty
  tego autora w danym serwisie, deterministycznie, bez zapytania do modelu.
  Lista jest lokalna i odwracalna w Ustawieniach → **Muted authors** (przycisk
  Unmute). „Keep this post” nadal wygrywa z tą listą.
* Te same akcje masz w rozwiniętym panelu statusu: **Mute author…** /
  **Allow author…**. Kliknij dowolny post na stronie. Zobaczysz podgląd z
  nazwą autora i informacją, że to lokalna decyzja bez zapytania do modelu.
   Zapis pokaże toast z **Undo**; Escape anuluje bez zapisywania.
* **Mute topic…** (rozwinięty panel): kliknij post, sprawdź lub zmień nazwę tematu,
  wybierz zasięg (ten serwis / wszystkie obsługiwane) i czas (24 h / 7 dni /
  bezterminowo). Dopasowanie jest semantyczne i używa tego samego zapytania co
  filtrowanie (jedno dodatkowe pytanie), więc może zwiększyć zużycie API. Przypadkowa
  wzmianka pozostaje widoczna, a „Keep this post” wygrywa z wyciszeniem tematu.
  Lista tematów, edycja, usuwanie i Undo: Ustawienia → **Muted topics**.
* **Grupowanie powtórek** (Ustawienia → Filter policy): pierwsza kopia zostaje,
  kolejne bliskie powtórki zwijają się pod paskiem „more similar posts”. Post z nową
  informacją lub kontrargumentem nie jest grupowany; wyłączenie opcji przywraca wszystko.
* **Tryb oszczędny (thrift)**: analiza chmurowa startuje dopiero, gdy post jest
  widoczny, a przewijanie na chwilę się zatrzyma (domyślnie 800 ms, zakres 300–3000 ms).
  Szybkie przewijanie nie tworzy zapytań; lokalne reguły działają od razu.

## 3a. Mój wyjątek (My exception rule)

W Ustawieniach, w sekcji reguł, znajdziesz pole **My exception rule (optional)**
z licznikiem znaków i plakietką statusu. To *wskazówka* dla modelu, nie
gwarantowany filtr: model może ją zignorować. Jest wysyłana jako dodatkowe
pytanie przy każdym zapytaniu do chmury (nawet gdy kategoria „Your exclusion
rule” jest wyłączona), więc zwiększa koszt tokenów. Nigdy nie wpisuj tam
sekretów; eksport diagnostyki pokazuje tylko informację, czy reguła jest
ustawiona, nigdy jej treść.

## 4. Własne filtry kosmetyczne (bezpieczne)

1. W popupie kliknij **Pick element**.
2. Najedź na element. Zobaczysz podgląd: zasięg (host), selektor, liczbę
   pasujących elementów i informację, co zostałoby ukryte.
3. Kliknij **Create rule** (albo **Cancel** / Escape).
4. Po zapisaniu masz 15 sekund na **Undo**; później **Undo deletion** znajdziesz
   w Ustawieniach → My cosmetic filters.

FeedGate odmówi, gdy cel jest zbyt szeroki: korzeń strony, nawigacja, główna
kolumna treści, kontener wielu elementów albo własny interfejs FeedGate.
Wybrany element nie staje się „postem” dla modelu. To wyłącznie lokalne ukrycie.

## 5. Naprawa strony (recovery)

* **Restore this site**: najpierw trwale zapisuje pauzę dla serwisu, potem
  prosi otwarte karty o usunięcie efektów. Jeśli karta nie odpowie, pauza i tak
  obowiązuje; użyj **Reload this tab with filtering paused** (ostrzeżenie:
  niezapisane dane w formularzach przepadną).
* **Disable cosmetic filters**: wyłącza stosowanie reguł, ale zachowuje ich
  listę, klucz i pozostałe ustawienia.
* **Resume this site**: wznawia filtrowanie; aplikacja ostrzeże, ile reguł
  nadal czeka w kwarantannie.

## 6. Diagnostyka i kopie

* **Export diagnostics** tworzy plik
  `feedgate-3.3.0-diagnostics-….json` bez kluczy, tekstów postów, autorów,
  pełnych adresów URL i surowych selektorów. Zawiera m.in. sekcje `ui`, `sites`,
  `cosmetic`, `renderer` i `provider` oraz odcisk wersji (`build`).
* **Export settings** zapisuje ustawienia w formacie wersji 6 (z regułami
  kosmetycznymi, to Twoja lokalna kopia). Import akceptuje też formaty 2.x–5.x;
  niezweryfikowane reguły stają się kwarantanną.
* **API usage** (Ustawienia → Review): dzienny licznik żądań (reset 00:00 UTC,
  pokazany w czasie lokalnym), trafienia cache, tokeny, błędy i anulowane żądania.
  Koszt pieniężny pojawia się wyłącznie po wpisaniu własnych stawek i zawsze jako
  *szacunek*, nigdy jako rachunek dostawcy.
* **06 Updates** porównuje działającą wersję z plikami na dysku (pakietowy
  `build.json`), otwiera `chrome://extensions` i pozwala pobrać **Export key
  backup**: kopię wyłącznie zaszyfrowanego sejfu (nigdy klucza jawnie).
  **Import key backup** wczytuje ją na innej instalacji; odblokujesz ją swoim
  hasłem. Diagnostyka zawiera dodatkowo sekcję `update`.

## 7. Szybka lista kontrolna po aktualizacji

1. Otwórz testowy kanał (Demo feed). Powinien pojawić się jeden lokalny
   zwinięty post z opisem zweryfikowanej etykiety platformy.
2. Otwórz zwykły post techniczny. Ma pozostać widoczny.
3. Sprawdź w pasku statusu, że tryb to „Running”, a w popupie, że sześć
   serwisów ma stan „ready”.
4. W eksporcie diagnostyki sprawdź `build.release` = `3.3.0` oraz
   `build.detector` = `ad-3.0.0`.
5. W Ustawieniach → **06 Updates** kliknij **Check files on disk**. Panel
   powinien pokazać „Up to date”.

## 8. Czego 3.3.0 świadomie nie robi

* Nie zmienia progów istniejących kategorii ani modelu. To wydanie o kontroli,
  nie o skuteczności modelu.
* Nie wysyła osobnego zapytania dla każdej pary post–temat: wyciszenie tematu to
  jedno dodatkowe pytanie w tym samym żądaniu, a grupowanie powtórek jest w pełni
  lokalne i nie kosztuje żadnego zapytania.
* Nie blokuje reklam sieciowych, nie skanuje obrazów, nie otwiera stron
  docelowych i nie zbiera historii przeglądania.
* Wykop pozostaje w wersji beta: oznaczenia reklamowe Wykopu nie mają dziś
  zweryfikowanego markera, więc miejsca promowane nie są lokalnie ukrywane.

Walidacja na żywym kluczu TypeSafe i zalogowanych serwisach nie została
wykonana w tym wydaniu. Wszystkie testy korzystają z fixture'ów.
