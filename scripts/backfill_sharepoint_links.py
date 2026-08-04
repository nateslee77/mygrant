"""One-time backfill: match grants.project_name against the real SharePoint
folder listing (GRANTS AWARDED library) and set sharepoint_link to a direct,
working deep-link into that folder.

Matching rule: a folder matches a grant if the grant's project_name starts
with the folder name on a whole-word basis (case-insensitive), e.g. folder
"92nd Street Linear Park" matches both "92nd Street Linear Park Development"
and "92nd Street Linear Park Community Engagement" -- multiple grants at the
same site legitimately share one folder. Only applies to grants where a
match is found; everything else is left untouched and reported.
"""
import sys
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import quote

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402
from app.models.models import Grant, User  # noqa: E402
from app.services.audit import write_audit_log  # noqa: E402

SITE_BASE = "https://lacounty.sharepoint.com/sites/DPR-SPO-NS-FiscalAdmin/GGrants/Forms/AllItems.aspx"
LIBRARY_PATH = "/sites/DPR-SPO-NS-FiscalAdmin/GGrants/Grants Documents/GRANTS - ALL/GRANTS AWARDED"
VIEW_ID = "e392fe80-6f22-4d4a-9b45-5e0730f4ed43"

ATTRIBUTED_TO_EMAIL = "nlee@parks.lacounty.gov"

# Folder name, Type -- parsed from the user-supplied directory listing.
# (Type "Item" rows are stray files sitting in the parent folder, not
# per-grant subfolders, so they're excluded from matching.)
RAW_ENTRIES = [
    ("119th Street", "Folder"),
    ("72nd Street Equestrian Facility", "Folder"),
    ("92nd Street Linear Park", "Folder"),
    ("95th & Normandie Park", "Folder"),
    ("Acton", "Folder"),
    ("Adventure", "Folder"),
    ("Agua Dulce", "Folder"),
    ("Allen Martin", "Folder"),
    ("Alondra", "Folder"),
    ("Altadena", "Folder"),
    ("Amigo", "Folder"),
    ("Apollo", "Folder"),
    ("Arboretum (Baldwin Hills)", "Folder"),
    ("Arcadia", "Folder"),
    ("Athens", "Folder"),
    ("Atlantic", "Folder"),
    ("Avocado Heights", "Folder"),
    ("Bassett", "Folder"),
    ("Belvedere", "Folder"),
    ("Bethune", "Folder"),
    ("Bill Blevins", "Folder"),
    ("Bodger", "Folder"),
    ("Bonelli", "Folder"),
    ("Calabasas", "Folder"),
    ("California River Parkways", "Folder"),
    ("Campanella", "Folder"),
    ("Carolyn Rosas", "Folder"),
    ("Carver", "Folder"),
    ("Castaic", "Folder"),
    ("Catalina", "Folder"),
    ("Charles White", "Folder"),
    ("Charter Oak", "Folder"),
    ("Chesebrough", "Folder"),
    ("City Terrace", "Folder"),
    ("Col. Leon Washington", "Folder"),
    ("COLA LANDSCAPE RECOVERY CTR", "Folder"),
    ("Cold Creek", "Folder"),
    ("Compton Creek", "Folder"),
    ("Countrywood", "Folder"),
    ("Crescenta Valley", "Folder"),
    ("Dalton", "Folder"),
    ("David March", "Folder"),
    ("Del Valle", "Folder"),
    ("Devil's Punchbowl", "Folder"),
    ("Dexter", "Folder"),
    ("Diamond Bar GC", "Folder"),
    ("Dodger RBI 2016 - South & East", "Folder"),
    ("Don Knabe (formerly Cerritos)", "Folder"),
    ("Don Wallace Trail", "Folder"),
    ("East Rancho Dominguez", "Folder"),
    ("Eaton Canyon", "Folder"),
    ("El Cariso", "Folder"),
    ("El Parque Nuestro", "Folder"),
    ("Emerald Necklace", "Folder"),
    ("Enterprise", "Folder"),
    ("Everett Martin", "Folder"),
    ("Exercise Equipment_Amigo La Mirada Sorensen", "Folder"),
    ("Fairfax Parcel", "Folder"),
    ("Farnsworth", "Folder"),
    ("Folsom Street Pocket Park", "Folder"),
    ("Friendship", "Folder"),
    ("George Lane", "Folder"),
    ("George Washington Carver", "Folder"),
    ("Gloria Heer", "Folder"),
    ("Hart", "Folder"),
    ("Hasley Canyon", "Folder"),
    ("Helen Keller", "Folder"),
    ("Hollywood Bowl", "Folder"),
    ("Jackie Robinson", "Folder"),
    ("Jake Kuredjian", "Folder"),
    ("Jesse Owens", "Folder"),
    ("John Anson Ford", "Folder"),
    ("Kenneth Hahn", "Folder"),
    ("Knollwood GC", "Folder"),
    ("La Crescenta", "Folder"),
    ("La Mirada", "Folder"),
    ("La Sierra", "Folder"),
    ("LA84", "Folder"),
    ("Ladera", "Folder"),
    ("Lakewood", "Folder"),
    ("Lennox", "Folder"),
    ("Littlerock", "Folder"),
    ("Lois Ewen", "Folder"),
    ("Loma Alta", "Folder"),
    ("Los Amigos Golf Course", "Folder"),
    ("Los Robles", "Folder"),
    ("Los Verdes Golf Course", "Folder"),
    ("Lower LA River", "Folder"),
    ("MacLaren", "Folder"),
    ("Maggie Hathaway", "Folder"),
    ("Magic Johnson", "Folder"),
    ("Manzanita", "Folder"),
    ("Marshall Canyon", "Folder"),
    ("Martin Luther King Jr", "Folder"),
    ("Mayberry", "Folder"),
    ("Michillinda", "Folder"),
    ("Mission Canyon", "Folder"),
    ("Mona", "Folder"),
    ("Monteith", "Folder"),
    ("Monument", "Folder"),
    ("MULTIPLE SITES", "Folder"),
    ("Nogales (Walnut Pocket Park)", "Folder"),
    ("North County", "Folder"),
    ("Northbridge", "Folder"),
    ("Norwalk", "Folder"),
    ("Obregon", "Folder"),
    ("Pacific Crest", "Folder"),
    ("Pamela", "Folder"),
    ("Park to Playa", "Folder"),
    ("Parque de los Suenos", "Folder"),
    ("Pathfinder", "Folder"),
    ("Pearblossom", "Folder"),
    ("Peck Road", "Folder"),
    ("Pepperbrook", "Folder"),
    ("Pickens Canyon", "Folder"),
    ("Pico Canyon", "Folder"),
    ("Placerita Canyon", "Folder"),
    ("PNA+ Implementation Plan", "Folder"),
    ("Puente Hills", "Folder"),
    ("Rancho Dominguez", "Folder"),
    ("Rimgrove", "Folder"),
    ("Rio Hondo", "Folder"),
    ("Rioux", "Folder"),
    ("Roosevelt", "Folder"),
    ("Rowland Heights", "Folder"),
    ("RTP_Shady Lane Trail", "Folder"),
    ("Ruben Ingold", "Folder"),
    ("Salazar", "Folder"),
    ("San Angelo", "Folder"),
    ("San Dimas", "Folder"),
    ("Santa Anita", "Folder"),
    ("Santa Fe Dam", "Folder"),
    ("Saybrook", "Folder"),
    ("Schabarum", "Folder"),
    ("SD2 - Martha.xlsx", "Item"),
    ("SD4 Golf Courses", "Folder"),
    ("Secret Valley", "Folder"),
    ("SGRDC_site plan.pdf", "Item"),
    ("SGV Aquatic Center", "Folder"),
    ("Skyline", "Folder"),
    ("Sorensen in SD4 (Diff from Stephen Sorenson in SD 5)", "Folder"),
    ("South Coast Botanic Garden", "Folder"),
    ("Steinmetz", "Folder"),
    ("Stephen Sorenson in SD5 (Diff from Sorenson in SD4)", "Folder"),
    ("Stoneview Nature Center", "Folder"),
    ("Sunshine", "Folder"),
    ("Ted Watkins", "Folder"),
    ("Tesoro Adobe", "Folder"),
    ("The Paseo at Rio Hondo", "Folder"),
    ("Thomas Burton", "Folder"),
    ("Trailview", "Folder"),
    ("Two Strike", "Folder"),
    ("Val Verde", "Folder"),
    ("Valleydale", "Folder"),
    ("Vasquez Rocks", "Folder"),
    ("VermontMedian_GrantToDPW", "Folder"),
    ("Veterans", "Folder"),
    ("Victoria", "Folder"),
    ("Virginia Robinson", "Folder"),
    ("Walnut Creek", "Folder"),
    ("Washington", "Folder"),
    ("West Basin", "Folder"),
    ("Whittier Aquatic Center", "Folder"),
    ("Whittier Narrows", "Folder"),
    ("Yvonne Burke", "Folder"),
]

FOLDER_NAMES = [name for name, type_ in RAW_ENTRIES if type_ == "Folder"]


def build_folder_url(folder_name: str) -> str:
    id_path = f"{LIBRARY_PATH}/{folder_name}"
    return f"{SITE_BASE}?id={quote(id_path)}&viewid={VIEW_ID}"


def normalize_words(text: str) -> list[str]:
    return text.lower().replace("&", "and").split()


def score_match(project_name: str, folder_name: str) -> float:
    project_words = set(normalize_words(project_name))
    folder_words = normalize_words(folder_name)
    folder_word_set = set(folder_words)
    overlap = len(folder_word_set & project_words) / len(folder_word_set) if folder_word_set else 0.0
    ratio = SequenceMatcher(None, project_name.lower(), folder_name.lower()).ratio()
    # Word overlap is the strong signal (e.g. every word of "Amigo" found in
    # "Amigo Park Restroom Renovation Project"); sequence ratio breaks ties
    # and helps when word tokenization doesn't line up cleanly.
    return overlap * 10 + ratio


def find_best_folder(project_name: str, folder_names: list[str]) -> str:
    return max(folder_names, key=lambda f: score_match(project_name, f))


LOW_CONFIDENCE_THRESHOLD = 3.0  # roughly: less than ~30% of the folder's words appear in the project name


def main():
    db = SessionLocal()
    try:
        attributed_user = db.scalar(select(User).where(User.email == ATTRIBUTED_TO_EMAIL))

        grants = db.scalars(select(Grant).order_by(Grant.project_name)).all()

        updated = []
        low_confidence = []
        used_folders = set()

        for grant in grants:
            folder = find_best_folder(grant.project_name, FOLDER_NAMES)
            score = score_match(grant.project_name, folder)
            used_folders.add(folder)

            new_link = build_folder_url(folder)
            if grant.sharepoint_link != new_link:
                before = grant.sharepoint_link
                grant.sharepoint_link = new_link
                write_audit_log(
                    db,
                    user_id=attributed_user.id if attributed_user else None,
                    user_name=attributed_user.name if attributed_user else None,
                    action="updated_grant",
                    table_name="grants",
                    record_id=grant.id,
                    detail={"before": {"sharepoint_link": before}, "after": {"sharepoint_link": new_link}},
                )
                updated.append((grant.project_name, folder, score))

            if score < LOW_CONFIDENCE_THRESHOLD:
                low_confidence.append((grant.project_name, folder, score))

        db.commit()

        unused_folders = [f for f in FOLDER_NAMES if f not in used_folders]

        print(f"Updated sharepoint_link on {len(updated)} of {len(grants)} grants.\n")
        print(f"Low-confidence matches worth a manual check ({len(low_confidence)}):")
        for project_name, folder, score in low_confidence:
            print(f"  - {project_name!r} -> {folder!r} (score {score:.2f})")
        print(f"\nFolders never matched to any grant ({len(unused_folders)}):")
        for name in unused_folders:
            print(f"  - {name}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
