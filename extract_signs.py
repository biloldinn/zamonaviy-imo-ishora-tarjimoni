import docx
import json
import re

def extract_signs(docx_path):
    doc = docx.Document(docx_path)
    signs = {}
    current_entry = None
    
    for p in doc.paragraphs:
        text = p.text.strip()
        if not text:
            continue
            
        # Match "1. Name (optional synonyms)" or similar
        match = re.match(r'^(\d+)\.\s*(.+)', text)
        if match:
            num = match.group(1)
            full_name = match.group(2)
            
            # Extract all names/synonyms from full_name
            # Replace parentheses with commas to treat them as synonyms
            all_names_text = full_name.replace('(', ',').replace(')', ',')
            names = [n.strip().lower() for n in re.split(r'[,;]', all_names_text) if n.strip()]
            
            if names:
                primary_name = names[0]
                current_entry = {
                    "original": full_name,
                    "description": "",
                    "number": num,
                    "synonyms": names
                }
                # Store by the primary name for now
                signs[primary_name] = current_entry
            continue
            
        if current_entry:
            if re.match(r'^\d+\.', text):
                continue
            current_entry["description"] += " " + text

    final_dict = {}
    for primary_name, entry in signs.items():
        desc = entry["description"].strip()
        desc = re.sub(r'\s+', ' ', desc) # Compress whitespace
        entry["description"] = desc
        
        # Add entry to final dict for EVERY synonym
        for syn in entry["synonyms"]:
            syn_clean = syn.strip()
            if syn_clean and syn_clean not in final_dict:
                final_dict[syn_clean] = entry

    return final_dict

if __name__ == "__main__":
    docx_path = 'C:/Users/User5/Downloads/01_ Imo ishoralar.docx'
    output_path = 'C:/Users/User5/zamonaviy-imo-ishora-tarjimoni/sign_dictionary.json'
    
    try:
        extracted_signs = extract_signs(docx_path)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(extracted_signs, f, ensure_ascii=False, indent=4)
        print(f"Successfully extracted {len(extracted_signs)} signs.")
    except Exception as e:
        print(f"Error: {e}")
