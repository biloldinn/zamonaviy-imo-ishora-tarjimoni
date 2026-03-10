import docx
import json
import re

def extract_signs(docx_path):
    doc = docx.Document(docx_path)
    signs = {}
    current_num = None
    current_name = None
    
    for p in doc.paragraphs:
        text = p.text.strip()
        if not text:
            continue
            
        # Match "1. Name (optional synonyms)"
        match = re.match(r'^(\d+)\.\s*(.+)', text)
        if match:
            num = match.group(1)
            full_name = match.group(2)
            # Remove parentheses content for the primary name
            clean_name = re.sub(r'\(.*?\)', '', full_name).strip()
            # Split by commas or semicolons if multiple names
            names = [n.strip() for n in re.split(r'[,;]', clean_name) if n.strip()]
            
            if names:
                primary_name = names[0]
                signs[primary_name] = {
                    "original": full_name,
                    "description": "",
                    "number": num
                }
                current_name = primary_name
            continue
            
        if current_name:
            # Append text to description, avoiding duplicate name/number lines
            if not re.match(r'^\d+\.', text):
                # Filter out English translations if they appear on separate lines
                # and descriptions that are just repetitions
                signs[current_name]["description"] += " " + text

    # Final cleanup of descriptions
    for name in signs:
        desc = signs[name]["description"].strip()
        # Remove common boilerplate or noise if needed
        signs[name]["description"] = desc

    return signs

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
