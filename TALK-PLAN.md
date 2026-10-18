# One Talk page: redesign plan

Date: 18 October 2026

## What I found in the code

| Page | File | What it does today |
|---|---|---|
| Talk | `src/features/communicate/CommunicateHub.jsx` | **Only a menu.** It has a message bar, three big buttons that open other pages (Type, Quick needs, Symbols), the first 4 saved phrases, and Call for help. |
| Type | `src/features/keyboard/KeyboardScreen.jsx` | Its **own message bar**, plus Save phrase, word suggestions and the keyboard. It hides the side menu. |
| Needs | `src/features/needs/QuickNeeds.jsx` | **No message bar.** Choosing a phrase only speaks it. You must press "Add to message" to put it in the message. It has 4 groups (Personal needs, Health and comfort, Family and assistance, General) and My phrases. |
| Symbols | `src/features/symbols/Symbols.jsx` | Its **own message bar**, the English/தமிழ்/Both choice, 5 groups and My symbols. |

**What is already shared:**

- One message, stored in `MessageContext`, with edit, undo, clear and add phrase. That is why text already survives switching pages.
- One message bar component (`MessageBar`), but it is drawn 3 times, once on each page.
- One speech helper (`useSpeak`).
- One page system (`Pager`).
- The phrase and symbol data, which already has English and Tamil.

**What overlaps:**

- **The message bar** appears on 3 pages, and Needs behaves differently from the others (it speaks but does not add to the message).
- **The Talk page** repeats links to pages that are also in the side menu.
- **The side menu** has 9 items, 4 of which are ways to make the same message.
- **Saved phrases** are shown both on Talk and in Needs → My phrases.

## The new design

**Talk becomes the one place to build a message:**

1. **The message, always at the top.** It shows the text with Speak, Undo and Clear in one row, plus Save phrase while typing. There is **one** message bar, and it stays in place when you switch.
2. **Four big method buttons:** Quick phrases · Needs · Symbols · Type message. Call for help sits at the end of this row, with its long dwell.
3. **The content area** changes with the method:
   - **Quick phrases:** Yes, No, Thank you, I need help, Please wait, and the other general and family phrases, plus My phrases.
   - **Needs:** Personal needs, and Health and comfort (hungry, thirsty, bathroom, pain, rest, medicine…).
   - **Symbols:** the existing symbol library, groups and My symbols.
   - **Type message:** the existing keyboard with word suggestions.
4. **Everything adds to the same message.** A phrase, need or symbol is added to the message and spoken (if "speak at once" is on). Typed text and chosen phrases or symbols mix freely.
5. **Language:** the English / தமிழ் / Both choice, made for Symbols, moves to the top bar of the whole Talk page. Phrases, needs, symbols and the buttons all follow it. The keyboard letters stay English.

**Navigation:**

- **Side menu:** Home, Talk, Calls, Music, News and Settings (6 instead of 9).
- **Old addresses still work.** `#/keyboard`, `#/needs` and `#/symbols` open Talk with that method chosen, and `#/communicate` opens Talk on Quick phrases. Choosing a method changes the address, so the browser Back button still works.
- **Home is not changed.** Its Communicate, Type, Quick needs and Symbols cards open the matching method.

**Code (reuse, no copies):**

| Part | File |
|---|---|
| Talk page | `src/features/talk/TalkPage.jsx` (new): the message bar, method buttons and content area |
| Quick phrases and Needs panel | `PhrasePanel.jsx`, made from `QuickNeeds.jsx`. One component used twice with different groups. |
| Symbols panel | `SymbolPanel.jsx`, made from `Symbols.jsx` without its message bar |
| Keyboard panel | `KeyboardPanel.jsx`, made from `KeyboardScreen.jsx` without its message bar |

Each old page file becomes a one-line shortcut, or is removed if nothing else uses it.

**Not touched:** eye tracking, calibration, coordinate mapping, Home, Calls, Music, News, Settings, the saved data and the translations.

**One phrase moves.** "I need help" moves from Personal needs to the Quick phrases group, because you listed it there. It is moved, not copied.

## Stages

1. **Panels.** Split the three pages into panels with no message bar of their own. The old pages keep working.
2. **Talk page.** Build the new Talk page, point the 4 addresses at it, and shorten the side menu.
3. **Layout.** Make it fit laptop screens (including 1366×657) in all three languages, and check the dwell targets.
4. **Tests.** Update the browser tests whose pages changed, add a Talk test, then run all tests and the build and copy the files to your folder.

## Behaviour that changes on purpose

- Needs now **adds to the message** (and speaks it), instead of only speaking it. The separate "Add to message" and "Speak again" buttons go away, because Speak in the message bar does this.
- The keyboard no longer hides the side menu, because it now lives inside Talk.
