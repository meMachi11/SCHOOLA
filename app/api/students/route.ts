import {
  json,
  requireUser,
  responseError,
  ApiError,
} from "../../../lib/school/auth";
import { allRecords } from "../../../lib/school/store";
import { canRead } from "../../../lib/school/policy";
export async function GET(req: Request) {
  try {
    const user = await requireUser(req),
      records = await allRecords();
    return json(
      records
        .filter((r) => r.kind === "students" && canRead(user, r, records))
        .map((r) =>
          user.role === "admin" ? r : { ...r, data: { ...r.data, notes: "" } },
        ),
    );
  } catch (e) {
    return responseError(e);
  }
}
export async function POST() {
  return responseError(
    new ApiError(
      410,
      "Utilisez /api/school avec un identifiant de synchronisation.",
    ),
  );
}
