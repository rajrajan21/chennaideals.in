# ChennaiDeals deal details and share/save update

## Included
- Adds an optional **Deal long details** field to the submit-deal form.
- Stores the long details in the existing description field using an internal marker, avoiding a database schema migration.
- Displays the long details in a dedicated **Deal details** section above Deal Lifecycle.
- Adds **Save deal** and **Share deal** actions on the deal page. Save is browser-local; Share uses the native share sheet where available or copies the URL.
- Replaces several garbled lifecycle symbols/text with readable characters.

## Apply
1. Extract the entire ZIP.
2. Copy the BAT, PS1, and `update_payload` folder into the project root:
   `C:\Users\itsme\Documents\chennaideals.in`
3. Double-click `Apply-ChennaiDeals-Deal-Details-Update.bat`.
4. Confirm `npm run build` succeeds before testing/deploying.

The script backs up the two source files before replacing them. It does not push to GitHub or deploy the site.

## Email/SMS deal alerts
A real alert requires server-side subscriptions plus an email/SMS delivery provider (for example SMTP/Resend and Twilio) and credentials configured in the deployment environment. This source update does not send email or SMS alerts; those should not be represented as active until the provider and subscription storage are configured.
