import frappe, os
from frappe.utils import nowdate, add_days, get_site_path

def cleanup_bulk_downloads():
    # get expired records (older than 30 days)
    expired = frappe.db.get_all(
        "Bulk Download",
        filters={"creation": ("<", add_days(nowdate(), -30))},
        fields=["name", "zip_file"]
    )

    for rec in expired:
        file_path = rec.get("zip_file")
        if file_path:
            abs_path = os.path.join(get_site_path(), "public", file_path.lstrip("/"))

            # Delete file if exists
            if os.path.exists(abs_path):
                try:
                    os.remove(abs_path)
                    frappe.logger().info(f"Deleted expired file: {abs_path}")
                except Exception as e:
                    frappe.logger().error(f"Error deleting {abs_path}: {e}")

        # Optionally delete record also
        frappe.delete_doc("Bulk Download", rec.name, force=1, ignore_permissions=True)

    frappe.db.commit()
