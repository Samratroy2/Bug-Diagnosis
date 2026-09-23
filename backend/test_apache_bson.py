from pathlib import Path
from bson import BSON


ROOT = Path(__file__).resolve().parent.parent
INPUT_FILE = ROOT / "data" / "apache" / "issues.bson"

LIMIT = 5


with INPUT_FILE.open("rb") as f:

    for i in range(LIMIT):

        header = f.read(4)

        if not header:
            break

        size = int.from_bytes(header, "little")

        body = f.read(size - 4)

        doc = BSON(header + body).decode()

        print(f"\n--- Apache Issue {i + 1} ---")

        print("ID       :", doc.get("id"))
        print("Key      :", doc.get("key"))
        print("Project  :", doc.get("projectname"))
        print("Summary  :", doc.get("summary"))
        print("Priority :", doc.get("priority"))
        print("Status   :", doc.get("status"))

        components = doc.get("components", [])

        if isinstance(components, list):
            print(
                "Components:",
                [
                    c.get("name")
                    for c in components
                    if isinstance(c, dict)
                ]
            )

print("\nApache BSON test successful.")