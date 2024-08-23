import frappe
import zipfile
import os
import io
import re
from frappe import _
from datetime import datetime
from frappe.model.document import Document
from frappe.utils.background_jobs import enqueue

class BulkDownload(Document):
    @frappe.whitelist()
    def generate_zip_folder(self):
        filters = frappe.parse_json(self.doctype_filter)
        fields = ['name']
        
        if self.field_name:
            fields.append(self.field_name)
            
        doc_list = frappe.db.get_list(self.document_type, filters=filters, fields=fields)
        if not doc_list:
            return False
        
        enqueue("bulk_download.bulk_download.doctype.bulk_download.bulk_download.generate_zip_file", 
                self=self, 
                doc_list=doc_list, 
                user=frappe.session.user, 
                field_name=self.field_name if self.field_name else None, 
                queue='long', 
                timeout=10000)
                
        return True

@frappe.whitelist()
def generate_zip_file(self, doc_list, user, field_name):
    error_list = {}
    pdf_list = {}
    
    for doc in doc_list:
        folder_name = sanitize_folder_name(doc.get(field_name), self.name) if field_name else None
        
        try:
            pdf_content = frappe.get_print(self.document_type, doc.name, print_format=self.print_format, as_pdf=True)
            
            if field_name:
                if folder_name not in pdf_list:
                    pdf_list[folder_name] = []
                pdf_list[folder_name].append((doc.name, pdf_content))
            else:
                pdf_list[doc.name] = pdf_content
                
        except Exception as e:
            error_list[doc.name] = str(e)

    memory_zip = io.BytesIO()

    with zipfile.ZipFile(memory_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
        if field_name:
            for folder, pdfs in pdf_list.items():
                for name, content in pdfs:
                    zf.writestr(f"{folder}/{name}.pdf", content)
        else:
            for name, content in pdf_list.items():
                zf.writestr(f"{name}.pdf", content)
                
        for file in zf.filelist:
            file.create_system = 0

    if zf.filelist:
        memory_zip.seek(0)
        project_folder_path = frappe.utils.get_bench_path() + "/sites/" + frappe.utils.get_path('public', 'files')[2:]
        zip_filename = f"{self.name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        output_path = os.path.join(project_folder_path, zip_filename)
        
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        with open(output_path, 'wb') as f:
            f.write(memory_zip.getvalue())
        
        self.zip_file = "/files/" + zip_filename
        frappe.db.set_value("Bulk Download", self.name, "zip_file", self.zip_file)
    if error_list:
        frappe.db.set_value("Bulk Download", self.name, "error_list", str(error_list))
        frappe.db.commit()

    if zip_filename:
        frappe.get_doc({
            "doctype": "Notification Log",
            "type": "Alert",
            "for_user": user,
            "email_content": f"{self.name} Document Zip Folder is Ready",
            "subject": f"{self.name} Document Zip Folder is Ready",
            "document_type": self.doctype,
            "document_name": self.name
        }).insert(ignore_permissions=True)

def sanitize_folder_name(value, document_name):
    if not isinstance(value, str):
        value = str(value)
    
    value = value.strip()
    sanitized_value = re.sub(r'[^a-zA-Z0-9]', '_', value)
    
    return sanitized_value or document_name
