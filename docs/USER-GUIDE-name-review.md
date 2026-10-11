# Name Review: admin guide

Member names split into first name, middle name, last name and suffix. One
member at a time. The display name does not change.

## Opening the screen

Admin → **Settings** tab → **Data Quality** → **Name Review**.
Direct address: `/admin/name-review`. Needs the **members.write** permission.

## Lists

| List | Contents |
|---|---|
| **Pending** | Not split yet. Start here. |
| **Auto split** | Plain two-word names, split as first and last name. Spot checks only. |
| **Confirmed** | Split checked by an admin. |

The number on each button: members in that list. Active members first, then
archived. Alphabetical.

## Reviewing one member

1. **Display name** at the top: the name as stored. Not changed by this screen.
2. **Each word**: one card per word of the display name, with a menu:
   **First name**, **Middle name**, **Last name**, **Suffix** or **Leave out**.
   The menu starts on the guess. Card color follows the menu.
3. Four boxes below, filled from the menus: **First name**, **Middle name**,
   **Last name**, **Suffix**. A menu change refills the boxes.
4. Yellow tags: parts of the guess worth a second look.
5. Menus first, boxes only for spelling fixes. **Enter** or **Confirm** saves
   and opens the next member.

Example: "Abando Chloe Gail", last name first. **Last name first** gives
Abando as last name, Chloe as first name, Gail as middle name. Gail menu to
**First name**: first name "Chloe Gail".

First name and last name required. Middle name and suffix optional.

## Buttons

| Button | Result |
|---|---|
| **Confirm** | Split saved. Next member. |
| **Skip** | Nothing saved. Next member. Skipped members stay in Pending. |
| **Back** | Previous member. A confirmed member can be confirmed again. |
| **Last name first** | First word read as the last name ("Abando Chloe Gail"). |
| **Middle joins first** | "John" + "Paul" in the middle box becomes first name "John Paul". |
| **Middle joins last** | "Santos" + "Reyes" becomes last name "Santos Reyes". |
| **Reset guess** | Menus and boxes back to the guess. |
| **Open profile** | Member profile in a new tab. |

## Tags

| Tag | Check |
|---|---|
| Check middle name | Three words. The middle word may be a second first name ("John Paul"). |
| Check first name | Four or more words. First name holds the leftovers. |
| Middle initial | "C." read as the middle initial. Usually right. |
| Surname particle | "Dela", "De los", "San" kept with the next word. |
| Suffix | "Jr.", "Sr.", "II", "III", "IV" moved to Suffix. |
| Nickname left out | Text in brackets or quotes set to **Leave out**. |
| Title word left out | "Sister", "Pastor", "Dr." set to **Leave out**. |
| Stray dot removed | "Bom." after a full word saved as "Bom". Initials keep the dot. |
| Comma in name | Check the order. "Cruz, Juan" reads as surname first. |
| One word | No last name known. Skip until the last name is known. |

## Notes

- **Parts joined** under the boxes: the four parts in one line. "Differs from
  display name" means a word was dropped or added. Fine when intended.
- A display name changed anywhere else (profile settings, Agapay) sends that
  member back to Pending.
- Add member and Edit member use the same four boxes. On an edit, the
  display name is rebuilt from the boxes only after a name box changes.
