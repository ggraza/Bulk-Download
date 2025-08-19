// Copyright (c) 2024, Meet and contributors
// For license information, please see license.txt

frappe.ui.form.on("Bulk Download", {
    refresh: function(frm) {
        frm.trigger("update_options");
        frm.set_query("document_type", function() {
            return {
                "filters": {
                    "istable": 0
                }
            }
        })
        frm.add_custom_button("Generate PDF", function() {
            frm.call('generate_zip_folder').then(function(r) {
                if (r.message) {
                    frappe.msgprint(__("PDF Generate Process Started"));
                }else {
                    frappe.msgprint(__("No records found"))
                }
            });
        })
    },
	document_type: function(frm) {
		frm.trigger("set_parent_document_type");
		frm.set_value("field_name", "");
		set_field_options(frm, frm.doc.document_type);
        frm.set_query("print_format", function() {
			return {
				"filters": {
					"doc_type": frm.doc.document_type,
					"disabled": 0
				}
			};
		});	
    },
    update_options: function (frm) {
		let doctype = frm.doc.document_type;
		let date_fields = [
			{ label: __("Created On"), value: "creation" },
			{ label: __("Last Modified On"), value: "modified" },
		];
		let value_fields = [];
		let group_by_fields = [{ label: "Created By", value: "owner" }];
		let aggregate_function_fields = [];
		let update_form = function () {
			// update select options
			frm.set_df_property("based_on", "options", date_fields);
			frm.set_df_property("value_based_on", "options", value_fields);
			frm.set_df_property("group_by_based_on", "options", group_by_fields);
			frm.set_df_property(
				"aggregate_function_based_on",
				"options",
				aggregate_function_fields
			);
			frm.trigger("show_filters");
		};

        if (doctype) {
			frappe.model.with_doctype(doctype, () => {
				// get all date and datetime fields
				frappe.get_meta(doctype).fields.map((df) => {
					if (["Date", "Datetime"].includes(df.fieldtype)) {
						date_fields.push({ label: df.label, value: df.fieldname });
					}
					if (
						["Int", "Float", "Currency", "Percent", "Duration"].includes(df.fieldtype)
					) {
						value_fields.push({ label: df.label, value: df.fieldname });
						aggregate_function_fields.push({ label: df.label, value: df.fieldname });
					}
					if (["Link", "Select"].includes(df.fieldtype)) {
						group_by_fields.push({ label: df.label, value: df.fieldname });
					}
				});
				update_form();
			});
		} else {
			// update select options
			update_form();
		}
	},
    show_filters: function (frm) {
		frm.chart_filters = [];
		frappe.dashboard_utils.get_filters_for_chart_type(frm.doc).then((filters) => {
			if (filters) {
				frm.chart_filters = filters;
			}
			frm.trigger("render_filters_table");

		});
	},
    render_filters_table: function (frm) {
		frm.set_df_property("filters_section", "hidden", 0);
		let is_document_type = frm.doc.chart_type !== "Report" && frm.doc.chart_type !== "Custom";
		let is_dynamic_filter = (f) => ["Date", "DateRange"].includes(f.fieldtype) && f.default;

		let wrapper = $(frm.get_field("doctype_filter").wrapper).empty();
		let table = $(`<table class="table table-bordered" style="cursor:pointer; margin:0px;">
			<thead>
				<tr>
					<th style="width: 20%">${__("Filter")}</th>
					<th style="width: 20%">${__("Condition")}</th>
					<th>${__("Value")}</th>
				</tr>
			</thead>
			<tbody></tbody>
		</table>`).appendTo(wrapper);
		$(`<p class="text-muted small">${__("Click table to edit")}</p>`).appendTo(wrapper);

		let filters = JSON.parse(frm.doc.doctype_filter || "[]");
		var filters_set = false;

		let fields = [];
		if (is_document_type) {
			fields = [
				{
					fieldtype: "HTML",
					fieldname: "filter_area",
				},
			];

			if (filters.length > 0) {
				filters.forEach((filter) => {
					const filter_row = $(`<tr>
							<td>${filter[1]}</td>
							<td>${filter[2] || ""}</td>
							<td>${filter[3]}</td>
						</tr>`);

					table.find("tbody").append(filter_row);
					filters_set = true;
				});
			}
		} else if (frm.chart_filters.length) {
			fields = frm.chart_filters.filter((f) => f.fieldname);

			fields.map((f) => {
				if (filters[f.fieldname]) {
					let condition = "=";
					const filter_row = $(`<tr>
							<td>${f.label}</td>
							<td>${condition}</td>
							<td>${filters[f.fieldname] || ""}</td>
						</tr>`);

					table.find("tbody").append(filter_row);
					filters_set = true;
				}
			});
		}

		if (!filters_set) {
			const filter_row = $(`<tr><td colspan="3" class="text-muted text-center">
				${__("Click to Set Filters")}</td></tr>`);
			table.find("tbody").append(filter_row);
		}

		table.on("click", () => {
			frm.is_disabled && frappe.throw(__("Cannot edit filters for standard charts"));

			let dialog = new frappe.ui.Dialog({
				title: __("Set Filters"),
				fields: fields.filter((f) => !is_dynamic_filter(f)),
				primary_action: function () {
					let values = this.get_values();
					if (values) {
						this.hide();
						if (is_document_type) {
							let filters = frm.filter_group.get_filters();
							frm.set_value("doctype_filter", JSON.stringify(filters));
						} else {
							frm.set_value("doctype_filter", JSON.stringify(values));
						}

						frm.trigger("show_filters");
					}
				},
				primary_action_label: "Set",
			});
			frappe.dashboards.filters_dialog = dialog;

			if (is_document_type) {
				frm.filter_group = new frappe.ui.FilterGroup({
					parent: dialog.get_field("filter_area").$wrapper,
					doctype: frm.doc.document_type,
					parent_doctype: frm.doc.parent_document_type,
					on_change: () => {},
				});

				frm.filter_group.add_filters_to_filter_group(filters);
			}

			dialog.show();

			dialog.set_values(filters);
		});
	},
    set_parent_document_type: async function (frm) {
		let document_type = frm.doc.document_type;
		if (!document_type) {
			frm.set_df_property("parent_document_type", "hidden", 1);
			return;
		}
		frappe.model.with_doctype(document_type, async () => {
			let doc_is_table = frappe.get_meta(document_type).istable;
			frm.set_df_property("parent_document_type", "hidden", !doc_is_table);

			if (doc_is_table) {
				let parents = await frappe.xcall(
					"frappe.desk.doctype.dashboard_chart.dashboard_chart.get_parent_doctypes",
					{ child_type: document_type }
				);

				frm.set_query("parent_document_type", function () {
					return {
						filters: {
							name: ["in", parents],
						},
					};
				});

				if (parents.length === 1) {
					frm.set_value("parent_document_type", parents[0]);
				}
			}
		});
	},
});


function set_field_options(frm, doctype){
    frappe.model.with_doctype(doctype, () => {
        const fields = frappe.meta.get_docfields(doctype) || [];

        const not_allowed_types = ["Section Break", "Column Break", "Table", "Code", "HTML", "Table MultiSelect", "Button"];

        const options = fields
            .filter(df => df.fieldname && !not_allowed_types.includes(df.fieldtype))
            .map(df => df.fieldname);

        frm.fields_dict.field_name.set_data(options);
    });
}