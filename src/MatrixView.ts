import type { Graph } from "graphlib";
import { cloneDeep } from "lodash";
import { createTreeHierarchy } from "hierarchy-js";
import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import {
  DATAVIEW_INDEX_DELAY,
  TRAIL_ICON,
  VIEW_TYPE_BREADCRUMBS_MATRIX,
} from "src/constants";
import type {
  AdjListItem,
  BreadcrumbsSettings,
  internalLinkObj,
  SquareProps,
} from "src/interfaces";
import type BreadcrumbsPlugin from "src/main";
import { closeImpliedLinks, debug } from "src/sharedFunctions";
import Lists from "./Components/Lists.svelte";
import Matrix from "./Components/Matrix.svelte";

export default class MatrixView extends ItemView {
  private plugin: BreadcrumbsPlugin;
  private view: Matrix | Lists;
  matrixQ: boolean;

  constructor(leaf: WorkspaceLeaf, plugin: BreadcrumbsPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  async onload(): Promise<void> {
    super.onload();
    await this.plugin.saveSettings();
    this.matrixQ = this.plugin.settings.defaultView;

    this.app.workspace.onLayoutReady(async () => {
      setTimeout(async () => await this.draw(), DATAVIEW_INDEX_DELAY);
    });

    this.plugin.addCommand({
      id: "local-index",
      name: "Copy a Local Index to the clipboard",
      callback: async () => {
        const settings = this.plugin.settings;
        const currFile = this.app.workspace.getActiveFile().basename;
        const allPaths = this.dfsAllPaths(
          closeImpliedLinks(
            this.plugin.currGraphs.gChildren,
            this.plugin.currGraphs.gParents
          ),
          currFile
        );
        const index = this.createIndex(currFile + "\n", allPaths, settings);
        debug(settings, { index });
        await navigator.clipboard.writeText(index).then(
          () => new Notice("Index copied to clipboard"),
          () => new Notice("Could not copy index to clipboard")
        );
      },
    });

    this.plugin.addCommand({
      id: "global-index",
      name: "Copy a Global Index to the clipboard",
      callback: async () => {
        const { gParents, gChildren } = this.plugin.currGraphs;
        const terminals = gParents.sinks();
        const settings = this.plugin.settings;

        let globalIndex = "";
        terminals.forEach((terminal) => {
          globalIndex += terminal + "\n";
          const allPaths = this.dfsAllPaths(
            closeImpliedLinks(gChildren, gParents),
            terminal
          );
          globalIndex = this.createIndex(globalIndex, allPaths, settings);
        });

        debug(settings, { globalIndex });
        await navigator.clipboard.writeText(globalIndex).then(
          () => new Notice("Index copied to clipboard"),
          () => new Notice("Could not copy index to clipboard")
        );
      },
    });
  }

  getViewType() {
    return VIEW_TYPE_BREADCRUMBS_MATRIX;
  }
  getDisplayText() {
    return "Breadcrumbs Matrix";
  }

  icon = TRAIL_ICON;

  async onOpen(): Promise<void> {
    await this.plugin.saveSettings();
    // this.app.workspace.onLayoutReady(async () => {
    //   setTimeout(async () => await this.draw(), DATAVIEW_INDEX_DELAY);
    // });
    // this.app.workspace.on("dataview:api-ready", () =>
    //   console.log("dv ready")
    // );
  }

  onClose(): Promise<void> {
    if (this.view) {
      this.view.$destroy();
    }
    return Promise.resolve();
  }

  unresolvedQ(to: string, from: string): boolean {
    const { unresolvedLinks } = this.app.metadataCache;
    if (!unresolvedLinks[from]) {
      return false;
    }
    return unresolvedLinks[from][to] > 0;
  }

  squareItems(g: Graph, currFile: TFile, realQ = true): internalLinkObj[] {
    let items: string[];

    if (realQ) {
      items = (g.successors(currFile.basename) ?? []) as string[];
    } else {
      items = (g.predecessors(currFile.basename) ?? []) as string[];
    }
    const internalLinkObjArr: internalLinkObj[] = [];
    // TODO I don't think I need to check the length here
    /// forEach won't run if it's empty anyway
    if (items.length) {
      items.forEach((item: string) => {
        internalLinkObjArr.push({
          to: item,
          cls:
            "internal-link breadcrumbs-link" +
            (this.unresolvedQ(item, currFile.path) ? " is-unresolved" : "") +
            (realQ ? "" : " breadcrumbs-implied"),
        });
      });
    }
    return internalLinkObjArr;
  }

  // ANCHOR Remove duplicate implied links

  removeDuplicateImplied(
    reals: internalLinkObj[],
    implieds: internalLinkObj[]
  ): internalLinkObj[] {
    const realTos = reals.map((real) => real.to);
    return implieds.filter((implied) => !realTos.includes(implied.to));
  }

  dfsAllPaths(g: Graph, startNode: string): string[][] {
    const queue: { node: string; path: string[] }[] = [
      { node: startNode, path: [] },
    ];
    const pathsArr: string[][] = [];

    let i = 0;
    while (queue.length > 0 && i < 1000) {
      i++;
      const currPath = queue.shift();

      const newNodes = (g.successors(currPath.node) ?? []) as string[];
      const extPath = [currPath.node, ...currPath.path];
      queue.unshift(
        ...newNodes.map((n: string) => {
          return { node: n, path: extPath };
        })
      );

      if (newNodes.length === 0) {
        pathsArr.push(extPath);
      }
    }
    return pathsArr;
  }

  dfsAdjList(g: Graph, startNode: string): AdjListItem[] {
    const queue: string[] = [startNode];
    const adjList: AdjListItem[] = [];

    let i = 0;
    while (queue.length && i < 1000) {
      i++;

      const currNode = queue.shift();
      const newNodes = (g.successors(currNode) ?? []) as string[];

      newNodes.forEach((succ) => {
        const next: AdjListItem = { name: currNode, parentId: succ };
        queue.unshift(succ);
        adjList.push(next);
      });
    }
    return adjList;
  }

  createIndex(
    // Gotta give it a starting index. This allows it to work for the global index feat
    index: string,
    allPaths: string[][],
    settings: BreadcrumbsSettings
  ): string {
    const copy = cloneDeep(allPaths);
    const reversed = copy.map((path) => path.reverse());
    reversed.forEach((path) => path.shift());

    const indent = "  ";
    const visited: { [node: string]: number[] } = {};
    reversed.forEach((path) => {
      for (let depth = 0; depth < path.length; depth++) {
        const currNode = path[depth];

        // If that node has been visited before at the current depth
        if (
          visited.hasOwnProperty(currNode) &&
          visited[currNode].includes(depth)
        ) {
          continue;
        } else {
          index += `${indent.repeat(depth)}- `;
          index += settings.wikilinkIndex ? "[[" : "";
          index += currNode;
          index += settings.wikilinkIndex ? "]]" : "";

          if (settings.aliasesInIndex) {
            const currFile = this.app.metadataCache.getFirstLinkpathDest(
              currNode,
              this.app.workspace.getActiveFile().path
            );
            const cache = this.app.metadataCache.getFileCache(currFile);

            const alias = cache?.frontmatter?.alias ?? [];
            const aliases = cache?.frontmatter?.aliases ?? [];

            const allAliases: string[] = [
              ...[alias].flat(3),
              ...[aliases].flat(3),
            ];
            if (allAliases.length) {
              index += ` (${allAliases.join(", ")})`;
            }
          }

          index += "\n";

          if (!visited.hasOwnProperty(currNode)) {
            visited[currNode] = [];
          }
          visited[currNode].push(depth);
        }
      }
    });
    return index;
  }

  async draw(): Promise<void> {
    this.contentEl.empty();
    const { gParents, gSiblings, gChildren } = this.plugin.currGraphs;
    const currFile = this.app.workspace.getActiveFile();
    const settings = this.plugin.settings;

    const closedParents = closeImpliedLinks(gParents, gChildren);
    // const dijkstraPaths = graphlib.alg.dijkstra(
    //   closedParents,
    //   currFile.basename
    // );

    const adjList: AdjListItem[] = this.dfsAdjList(
      closedParents,
      currFile.basename
    );
    console.log({ adjList });

    const noDoubles = adjList.filter(
      (thing, index, self) =>
        index ===
        self.findIndex(
          (t) => t.name === thing.name && t?.parentId === thing?.parentId
        )
    );
    console.log({ noDoubles });
    console.time("tree");
    const tree = createTreeHierarchy(noDoubles, { excludeParent: true });
    console.timeEnd("tree");
    console.log({ tree });

    // for (const [node, path] of Object.entries(dijkstraPaths)) {
    //   const item: AdjListItem = { id: node };
    //   const predecessor: string | undefined = path.predecessor;
    //   if (predecessor) {
    //     item.parentId = predecessor;
    //   }
    //   adjList.push(item);
    // }

    const viewToggleButton = this.contentEl.createEl("button", {
      text: this.matrixQ ? "List" : "Matrix",
    });
    viewToggleButton.addEventListener("click", async () => {
      this.matrixQ = !this.matrixQ;
      viewToggleButton.innerText = this.matrixQ ? "List" : "Matrix";
      await this.draw();
    });

    const [parentFieldName, siblingFieldName, childFieldName] = [
      settings.showNameOrType ? settings.parentFieldName : "Parent",
      settings.showNameOrType ? settings.siblingFieldName : "Sibling",
      settings.showNameOrType ? settings.childFieldName : "Child",
    ];

    let [
      realParents,
      realSiblings,
      realChildren,
      impliedParents,
      impliedChildren,
    ] = [
      this.squareItems(gParents, currFile),
      this.squareItems(gSiblings, currFile),
      this.squareItems(gChildren, currFile),
      this.squareItems(gChildren, currFile, false),
      this.squareItems(gParents, currFile, false),
    ];

    // SECTION Implied Siblings
    /// Notes with the same parents
    const currParents = (gParents.successors(currFile.basename) ??
      []) as string[];
    let impliedSiblingsArr: internalLinkObj[] = [];

    if (currParents.length) {
      currParents.forEach((parent) => {
        const impliedSiblings = (gParents.predecessors(parent) ??
          []) as string[];

        // The current note is always it's own implied sibling, so remove it from the list
        const indexCurrNote = impliedSiblings.indexOf(currFile.basename);
        impliedSiblings.splice(indexCurrNote, 1);

        // Create thie implied sibling SquareProps
        impliedSiblings.forEach((impliedSibling) => {
          impliedSiblingsArr.push({
            to: impliedSibling,
            cls:
              "internal-link breadcrumbs-link breadcrumbs-implied" +
              (this.unresolvedQ(impliedSibling, currFile.path)
                ? " is-unresolved"
                : ""),
          });
        });
      });
    }

    /// A real sibling implies the reverse sibling
    impliedSiblingsArr.push(...this.squareItems(gSiblings, currFile, false));

    // !SECTION

    impliedParents = this.removeDuplicateImplied(realParents, impliedParents);
    impliedSiblingsArr = this.removeDuplicateImplied(
      realSiblings,
      impliedSiblingsArr
    );
    impliedChildren = this.removeDuplicateImplied(
      realChildren,
      impliedChildren
    );

    debug(settings, {
      realParents,
      impliedParents,
      realSiblings,
      impliedSiblingsArr,
      realChildren,
      impliedChildren,
    });

    const parentsSquare: SquareProps = {
      realItems: realParents,
      impliedItems: impliedParents,
      fieldName: parentFieldName,
    };

    const siblingSquare: SquareProps = {
      realItems: realSiblings,
      impliedItems: impliedSiblingsArr,
      fieldName: siblingFieldName,
    };

    const childrenSquare: SquareProps = {
      realItems: realChildren,
      impliedItems: impliedChildren,
      fieldName: childFieldName,
    };

    if (this.matrixQ) {
      this.view = new Matrix({
        target: this.contentEl,
        props: {
          parents: parentsSquare,
          siblings: siblingSquare,
          children: childrenSquare,
          currFile,
          settings: settings,
          matrixView: this,
          app: this.app,
        },
      });
    } else {
      this.view = new Lists({
        target: this.contentEl,
        props: {
          parents: parentsSquare,
          siblings: siblingSquare,
          children: childrenSquare,
          currFile,
          settings: settings,
          matrixView: this,
          app: this.app,
        },
      });
    }
  }
}
