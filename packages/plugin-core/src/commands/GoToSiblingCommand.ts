import {
  DEngineClient,
  DNodeUtils,
  DWorkspaceV2,
  isNumeric,
  NoteProps,
  NotePropsByIdDict,
  NoteUtils,
  RespV3,
} from "@dendronhq/common-all";
import _ from "lodash";
import path from "path";
import { window } from "vscode";
import { PickerUtilsV2 } from "../components/lookup/utils";
import { ExtensionProvider } from "../ExtensionProvider";
import { UNKNOWN_ERROR_MSG } from "../logger";
import { MessageSeverity, VSCodeUtils } from "../vsCodeUtils";
import { WSUtilsV2 } from "../WSUtilsV2";
import { BasicCommand } from "./base";

type Direction = "next" | "prev";
type CommandOpts = { direction: Direction };
export { CommandOpts as GoToSiblingCommandOpts };

type CommandOutput = {
  msg: "ok" | "no_editor" | "no_siblings" | "other_error";
};

export class GoToSiblingCommand extends BasicCommand<
  CommandOpts,
  CommandOutput
> {
  key = "dendron.goToSibling";

  async gatherInputs(): Promise<any> {
    return {};
  }

  async execute(opts: CommandOpts) {
    const ctx = "GoToSiblingCommand";
    // validate editor and note exists
    const textEditor = VSCodeUtils.getActiveTextEditor();
    if (!textEditor) {
      window.showErrorMessage("You need to be in a note to use this command");
      return {
        msg: "no_editor" as const,
      };
    }

    const fname = path.basename(textEditor.document.uri.fsPath, ".md");
    const ext = ExtensionProvider.getExtension();
    const workspace = ext.getDWorkspace();
    const note = await this.getActiveNote(workspace.engine, fname);
    if (!note) throw new Error(`${ctx}: ${UNKNOWN_ERROR_MSG}`);

    let siblingNote: NoteProps;
    // If the active note is a journal note, get the sibling note based on the chronological order
    if (await this.canBeHandledAsJournalNote(note, workspace.engine)) {
      const resp = await this.getSiblingForJournalNote(
        workspace.engine.notes,
        note,
        opts.direction
      );
      if (resp.error) {
        VSCodeUtils.showMessage(MessageSeverity.WARN, resp.error.message, {});
        return { msg: "other_error" } as CommandOutput;
      }
      siblingNote = resp.data.sibling;
    } else {
      const resp = this.getSibling(workspace, note, opts.direction, ctx);
      if (resp.error) {
        VSCodeUtils.showMessage(MessageSeverity.WARN, resp.error.message, {});
        return { msg: "other_error" } as CommandOutput;
      }
      siblingNote = resp.data.sibling;
    }

    await new WSUtilsV2(ext).openNote(siblingNote);
    return { msg: "ok" as const };
  }

  async getActiveNote(
    engine: DEngineClient,
    fname: string
  ): Promise<NoteProps | null> {
    const vault = PickerUtilsV2.getVaultForOpenEditor();
    const hitNotes = await engine.findNotes({ fname, vault });
    return hitNotes.length !== 0 ? hitNotes[0] : null;
  }

  private async canBeHandledAsJournalNote(
    note: NoteProps,
    engine: DEngineClient
  ): Promise<boolean> {
    const markedAsJournalNote =
      NoteUtils.getNoteTraits(note).includes("journalNote");
    if (!markedAsJournalNote) return false;

    // Check the date format for journal note. Only when date format of journal notes is default,
    // navigate chronologically
    const config = await engine.getConfig();
    const dateFormat = config.data?.workspace.journal.dateFormat;
    return dateFormat === "y.MM.dd";
  }

  private async getSiblingForJournalNote(
    allNotes: NotePropsByIdDict,
    currNote: NoteProps,
    direction: Direction
  ): Promise<RespV3<{ sibling: NoteProps }>> {
    const journalNotes = this.getSiblingsForJournalNote(allNotes, currNote);
    // If the active note is the only journal note in the workspace, there is no sibling
    if (journalNotes.length === 1) {
      return {
        error: {
          name: "no_siblings",
          message:
            "There is no sibling journal note. Currently open note is the only journal note in the current workspace",
        },
      };
    }
    // Sort all journal notes in the workspace
    const sortedJournalNotes = _.sortBy(journalNotes, [
      (note) => this.getDateFromJournalNote(note).valueOf(),
    ]);
    const currNoteIdx = _.findIndex(sortedJournalNotes, { id: currNote.id });
    // Get the sibling based on the direction.
    let sibling: NoteProps;
    if (direction === "next") {
      sibling =
        currNoteIdx !== sortedJournalNotes.length - 1
          ? sortedJournalNotes[currNoteIdx + 1]
          : // If current note is the latest journal note, get the earliest note as the sibling
            sortedJournalNotes[0];
    } else {
      sibling =
        currNoteIdx !== 0
          ? sortedJournalNotes[currNoteIdx - 1]
          : // If current note is the earliest journal note, get the last note as the sibling
            _.last(sortedJournalNotes)!;
    }
    return { data: { sibling } };
  }

  private getSiblingsForJournalNote = (
    notes: NotePropsByIdDict,
    currNote: NoteProps
  ): NoteProps[] => {
    const monthNote = notes[currNote.parent!];
    const yearNote = notes[monthNote.parent!];
    const parentNote = notes[yearNote.parent!];

    const siblings: NoteProps[] = [];
    parentNote.children.forEach((yearNoteId) => {
      const yearNote = notes[yearNoteId];
      yearNote.children.forEach((monthNoteId) => {
        const monthNote = notes[monthNoteId];
        monthNote.children.forEach((dateNoteId) => {
          const dateNote = notes[dateNoteId];
          siblings.push(dateNote);
        });
      });
    });
    // Filter out stub notes
    return siblings.filter((note) => !note.stub);
  };

  private getSibling(
    workspace: DWorkspaceV2,
    note: NoteProps,
    direction: Direction,
    ctx: string
  ): RespV3<{ sibling: NoteProps }> {
    // Get sibling notes
    const siblingNotes = this.getSiblings(workspace.engine.notes, note);
    // Check if there is any sibling notes
    if (siblingNotes.length <= 1) {
      return {
        error: {
          name: "no_siblings",
          message: "One is the loneliest number. This node has no siblings :(",
        },
      };
    }
    // Sort the sibling notes
    const sortedSiblingNotes = this.sortNotes(siblingNotes);
    // Get the index of the active note in the sorted notes
    const idx = _.findIndex(sortedSiblingNotes, { id: note.id });
    // Deal with the unexpected error
    if (idx < 0) {
      throw new Error(`${ctx}: ${UNKNOWN_ERROR_MSG}`);
    }
    // Get sibling based on the direction
    let sibling: NoteProps;
    if (direction === "next") {
      sibling =
        idx !== siblingNotes.length - 1
          ? sortedSiblingNotes[idx + 1]
          : sortedSiblingNotes[0];
    } else {
      sibling =
        idx !== 0 ? sortedSiblingNotes[idx - 1] : _.last(sortedSiblingNotes)!;
    }
    return { data: { sibling } };
  }

  private getSiblings(
    notes: NotePropsByIdDict,
    currNote: NoteProps
  ): NoteProps[] {
    if (currNote.parent === null) {
      return currNote.children
        .map((id) => notes[id])
        .filter((note) => !note.stub)
        .concat(currNote);
    } else {
      return notes[currNote.parent].children
        .map((id) => notes[id])
        .filter((note) => !note.stub);
    }
  }

  private sortNotes(notes: NoteProps[]) {
    // check if there are numeric-only nodes
    const numericNodes = _.filter(notes, (o) => {
      const leafName = DNodeUtils.getLeafName(o);
      return isNumeric(leafName);
    });
    // determine how much we want to zero-pad the numeric-only node names
    let padLength = 0;
    if (numericNodes.length > 0) {
      const sortedNumericNodes = _.orderBy(
        numericNodes,
        (o) => {
          return DNodeUtils.getLeafName(o)!.length;
        },
        "desc"
      );
      padLength = sortedNumericNodes[0].fname.length;
    }
    // zero-pad numeric-only nodes before sorting
    return _.sortBy(notes, (o) => {
      const leafName = DNodeUtils.getLeafName(o);
      if (isNumeric(leafName)) {
        return _.padStart(leafName, padLength, "0");
      }
      return leafName;
    });
  }

  private getDateFromJournalNote(note: NoteProps): Date {
    const [year, month, date] = note.fname
      .split("")
      .slice(-3)
      .map((str) => parseInt(str, 10));
    return new Date(year, month - 1, date);
  }
}
