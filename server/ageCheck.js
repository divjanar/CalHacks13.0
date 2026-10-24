// Check age using a calendar date, without timezone conversion.
// Feb. 29 birthdays reach the next age on March 1 in non-leap years.
function checkAge(dob, today) {
  const needsReview = {
    status: "needs_review",
    eligible: null,
  };

  if (typeof dob !== "string") {
    return needsReview;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);

  if (!match) {
    return needsReview;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Round-trip the date to reject impossible dates like February 30.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);

  if (
    year < 1900 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return needsReview;
  }

  let age = today.year - year;

  const birthdayHasPassed =
    today.month > month ||
    (today.month === month && today.day >= day);

  if (!birthdayHasPassed) {
    age -= 1;
  }

  // Future dates or implausible ages require review.
  if (age < 0 || age > 120) {
    return needsReview;
  }

  return {
    status: age >= 18 ? "meets_age_requirement" : "under_18",
    eligible: age >= 18,
  };
}

module.exports = { checkAge };