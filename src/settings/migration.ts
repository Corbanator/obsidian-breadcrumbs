import { ListIndex } from "src/commands/list_index";
import type { Hierarchy } from "src/interfaces/hierarchies";
import type {
	BreadcrumbsSettings,
	OLD_BREADCRUMBS_SETTINGS,
} from "src/interfaces/settings";
import type BreadcrumbsPlugin from "src/main";
import { blank_hierarchy } from "src/utils/hierarchies";

export const migrate_old_settings = async (plugin: BreadcrumbsPlugin) => {
	const settings = plugin.settings as BreadcrumbsSettings &
		OLD_BREADCRUMBS_SETTINGS;

	// TODO: Eventually, uncomment the delete lines to remove old versions

	// SECTION: Hierarchies
	/// Hierarchies used to just be the Record<Direction, string[]>, but it's now wrapped in an object
	/// We can also handle the move of implied_relationships here
	if (settings.userHiers && settings.impliedRelations) {
		const implied_relationships: Hierarchy["implied_relationships"] = {
			...blank_hierarchy().implied_relationships,

			self_is_sibling: settings.impliedRelations.siblingIdentity,
			cousin_is_sibling: settings.impliedRelations.cousinsIsSibling,
			same_parent_is_sibling:
				settings.impliedRelations.sameParentIsSibling,
			same_sibling_is_sibling:
				settings.impliedRelations.siblingsSiblingIsSibling,
			siblings_parent_is_parent:
				settings.impliedRelations.siblingsParentIsParent,
			parents_sibling_is_parent:
				settings.impliedRelations.parentsSiblingsIsParents,
		};

		plugin.settings.hierarchies = settings.userHiers.map((hierarchy) => ({
			dirs: hierarchy,
			implied_relationships,
		}));

		// delete settings.userHiers;
		// delete settings.impliedRelations;
	}

	// SECTION: Explicit edge sources

	/// Tag note
	if (settings.tagNoteField !== undefined) {
		plugin.settings.explicit_edge_sources.tag_note.default_field =
			settings.tagNoteField;

		// delete settings.tagNoteField;
	}

	/// Dendron
	if (
		settings.addDendronNotes !== undefined &&
		settings.dendronNoteField !== undefined &&
		settings.trimDendronNotes !== undefined &&
		settings.dendronNoteDelimiter !== undefined
	) {
		plugin.settings.explicit_edge_sources.dendron_note = {
			enabled: settings.addDendronNotes,
			default_field: settings.dendronNoteField,
			delimiter: settings.dendronNoteDelimiter,
			display_trimmed: settings.trimDendronNotes,
		};

		// delete settings.addDendronNotes;
		// delete settings.dendronNoteField;
		// delete settings.trimDendronNotes;
		// delete settings.dendronNoteDelimiter;
	}

	/// Date notes
	if (
		settings.addDateNotes !== undefined &&
		settings.dateNoteField !== undefined &&
		settings.dateNoteFormat !== undefined
	) {
		plugin.settings.explicit_edge_sources.date_note = {
			enabled: settings.addDateNotes,
			default_field: settings.dateNoteField,
			date_format: settings.dateNoteFormat,
		};

		// delete settings.addDateNotes;
		// delete settings.dateNoteField;
		// delete settings.dateNoteFormat;
	}

	// SECTION: Views
	/// Page
	if (settings.respectReadableLineLength !== undefined) {
		plugin.settings.views.page.all.readable_line_width =
			settings.respectReadableLineLength;

		// delete settings.respectReadableLineLength;
	}

	//// Grid
	if (settings.showGrid !== undefined) {
		plugin.settings.views.page.grid.enabled = settings.showGrid;
		// delete settings.showGrid;
	}

	if (settings.noPathMessage !== undefined) {
		plugin.settings.views.page.grid.no_path_message =
			settings.noPathMessage;
		// delete settings.noPathMessage;
	}

	//// Prev/Next
	if (settings.showPrevNext !== undefined) {
		plugin.settings.views.page.prev_next.enabled = settings.showPrevNext;

		// delete settings.showPrevNext;
	}

	// SECTION: Commands
	/// Rebuild Graph
	if (
		settings.showRefreshNotice !== undefined &&
		settings.refreshOnNoteSave !== undefined &&
		settings.refreshOnNoteChange !== undefined
	) {
		plugin.settings.commands.rebuild_graph.notify =
			settings.showRefreshNotice;

		plugin.settings.commands.rebuild_graph.trigger = {
			note_save: settings.refreshOnNoteSave,
			layout_change: settings.refreshOnNoteChange,
		};

		// delete settings.showRefreshNotice;
		// delete settings.refreshOnNoteSave;
		// delete settings.refreshOnNoteChange;
	}

	/// List Index
	if (
		settings.wikilinkIndex !== undefined &&
		settings.aliasesInIndex !== undefined &&
		settings.createIndexIndent !== undefined
	) {
		plugin.settings.commands.list_index.default_options = {
			...plugin.settings.commands.list_index.default_options,

			indent: settings.createIndexIndent,
			link_kind: settings.wikilinkIndex ? "wiki" : "none",
			show_node_options: {
				...ListIndex.DEFAULT_OPTIONS.show_node_options,
				alias: settings.aliasesInIndex,
			},
		};

		// delete settings.wikilinkIndex;
		// delete settings.aliasesInIndex;
		// delete settings.createIndexIndent;
	}

	/// Freeze implied edges
	if (settings.writeBCsInline !== undefined) {
		plugin.settings.commands.freeze_implied_edges.default_options.destination =
			settings.writeBCsInline ? "dataview-inline" : "frontmatter";

		// delete settings.writeBCsInline;
	}

	await plugin.saveSettings();
};
