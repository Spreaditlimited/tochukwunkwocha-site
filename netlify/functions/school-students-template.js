const { badMethod } = require("./_lib/http");
const { schoolStudentsCsvTemplate } = require("./_lib/schools");

exports.handler = async function (event) {
  if (event.httpMethod !== "GET") return badMethod();
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="school-students-template.csv"',
      "Cache-Control": "no-store",
    },
    body: schoolStudentsCsvTemplate(),
  };
};

