Expense app MERN-Stack Introduction
This document describes the project overview for the development of a browser-based expenses application for AussenDienst GmbH (fictitious company).
Timetable

Main technologies
The browser-based expense application is developed on the basis of MERN-Stack with CRUD operations.
The MERN stack is a
 MongoDB: Document-orientated NoSQL database for flexible expense structure
 Express.js: Backend framework for API development
 React.js: front-end library for interactive UI components
 Node.js: JavaScript runtime environment for server-side logic
The latest version of each technology is used.
Module syntax
The project must be implemented using the ES6 module syntax (ECMAScript 2015).
Overview
 The company AussenDienst GmbH (hereinafter referred to as AD) is a marketing service provider that employs sales representatives (hereinafter referred to as AMA) throughout the country.
 The AD wants to provide a browser-based expenses application for its AMA.
 The application is for internal use only and should not be o􏰀ered to third parties.
 As the AMA are only travelling by car, only this expense category can be recorded in the
app (expenses for public transport are still billed outside the app).
 Due to the urgency and the budget currently available, it is important to the client that
the application is developed as an MVP (Minimum Viable Product).
Most important features (what the app should do)

1. CRUD operations for expenses (expenses), in particular expenses for travelling expenses, and income (expense reimbursements)
   a. C Create AMA can record expenses
   b. R Read AMA can call up/view their expenses
   1
   Expense app MERN-Stack
   c. U Update AMA can mutate recorded expenses
   d. D Delete AMA can delete recorded expenses 2. Modern, contemporary and intuitive user interface (UI)
   a. The UI should be user-friendly and visually appealing. It should also be easy to navigate.
   b. A fully responsive design is required, i.e. the app should work equally well on mobile devices, tablets and desktops.
2. Google
   a. The AMA can enter start and arrival points for their journey.
   b. The app should auto-complete the place names to make input easier.
   c. Should the calculation be possible for stopovers?
   d. The app calculates the route automatically.
3. Automatic expense calculation
   a. Based on the distance travelled, the app should calculate the costs using a
   predefined cost rate per kilometre. The predefined cost rate is determined by the
   management of AD. 5. Graphical output of expenses
   a. The app is designed to provide simple graphical representations of the recorded expenditure and for the periods month, quarter and year.
   i. For example:
4. Breakdown by category, e.g.
   a. Total distance travelled
   b. Total expenses incurred
5. Monthly statistics, e.g.
   a. How many expenses did an AMA incur in month X? 6. Replacing paper-based expense reports
   a. The app is intended to largely replace the current paper-based expense reports. 7. The expense reports can be exported as a PDF or .csv file.

6. Detailed catalogue of requirements
   I divide the project into technical and functional requirements. This helps me to take a targeted and structured approach and serves as a blueprint.
    User authentication: login/logout, role-based access.
    Expense entry: Enter (C), call (R), edit (U) and delete (D) expenses.
    Google Maps integration: auto-completion of addresses/locations, calculation of route
   distance.
    Calculation of expenses: route distance multiplied by cost rate per kilometre.
   3
   Expense app MERN-Stack
    Dashboard: graphical representation and statistics for administrator and user.
    Responsive UI: functional on mobile devices, tablets and desktops. (Simon's
   suggestion: divide into phases)
    Export functions: Export of reports and expense overviews as PDF or .csv file
    User profile management: editing personal information and settings
7. User flow chart
   Visualisation of how users can navigate through the app.
    Example of the procedure: o User logs in
   o User enters journey details (start and destination)
   o App calculates distance and costs
   o User sends expense entry
   o User sees the history of expense recording and statistics o Consideration of alternative process flows, e.g.
    if the Google Maps API is not available...
    other challenges...
8. Data and information flow
   Various questions arise on this topic.
    How is data transferred between the frontend and backend?
    How should the database be structured to store users, expenses and reports?
    Which API endpoints are required for the app to work? For example
   o /expenses/create o /expenses/update
   A complete list of API endpoints can be found in section 7.2
   Think about security measures for data transmission (e.g. HTTPS, JWT authentication).
9. Data modelling
   5.1 User model (authentication and roles)
   Purpose
    Saves user data (administrator, user)
    Enables authentication (login/logout)
    Assigns roles based on login data (administrator, user)
   Fields (enumeration only; correct naming follows during programming)
    ID (unique identifier)
   The flow chart has so far only been described in text form. An actual diagram is still being
   created.
   4

Expense app MERN-Stack
 Name (full name)
 E-mail (required for registration)
 Password (hashed)
 Role (′′admin′′ | ′′sales_rep′′)
 Date and time stamp (createdAt, updatedAt)
 Password reset token
 Token expiry date
5.2 Expense model (storage of expense reports)
Purpose
 Saves the output(s) for each journey
 Links each output to a user and a category
 Automatic calculation of costs based on the distance travelled
Fields (enumeration only; correct naming follows during programming)
 ID (unique identifier)
 User ID (relationship to the user model)
 Category ID (relationship to the category model)
 Starting point (start address)
 Destination point (destination address)
 Distance in kilometres (calculated distance in kilometres)
 Cost per kilometre (cost rate per kilometre)
 Total cost (automatically calculated: distance km \* cost per km)
 Date (date of the journey)
 Date and time stamp (createdAt, updatedAt)
 Field for "Remarks/Notes" about the trip
5.3 Category model (categorisation/organisation of expenses)
Purpose
 Defines the di􏰀erent types of expenses
 Helps for reporting and filtering
Fields
 ID (unique identifier)
 Designation (e.g. fuel, road tolls, URE (maintenance, repairs, replacement))
 Description (optional details for better comprehensibility)
 Date and time stamp (createdAt, updatedAt)
5.4 Reporting model (statistics and analyses)
Purpose
 Creates a summary of expenses o Numerical
o Visual
 Helps to identify spending trends
Fields
 ID (unique identifier)
 User ID (relationship to the user model)
5

Expense app MERN-Stack
 Month (in which month was the expense incurred)
 Year (in which year the expense was incurred)
 Total distance travelled (total kilometres travelled)
 Total expense amount (sum of expenses incurred)
 Date and time stamp (createdAt, updatedAt)
5.5 Role model (administration of authorisations)
Purpose
 Defines the various roles (Admin, AMA)
 Ensures that only Admin can manage settings
Fields
 ID (unique identifier)
 Role (′′admin′′ | ′′sales_rep′′)
5.6 Settings Model
Purpose
 Defines the system-wide settings o Cost rate per kilometre
o Catering allowance
o Accommodation allowance
o Other flat-rate compensation (e.g. MAUT/vignettes)
6

Expense app MERN-Stack 6. Structure
User Expense Category Report Role
Causes costs
Saves costs
Categorised costs Aggregated costs for reporting Manages access control
7

Expense app MERN-Stack 7. API design with Mongoose, Express.js and Node.js
In order to develop an API for a stack with MongoDB (Mongoose), Express.js and Node.js, I intend to proceed as follows:
7.1 Define requirements for the API
The question arises as to which functionalities the API must enable for this project. These are:
 User authentication: login/logout, role-based access.
 Expense entry: Enter (C), call (R), edit (U) and delete (D) expenses.
 Categorisation of expenses.
 Creation of the reporting system.

2. Detailed catalogue of requirements
   I divide the project into technical and functional requirements. This helps me to take a targeted and structured approach and serves as a blueprint.
    User authentication: login/logout, role-based access.
    Expense entry: Enter (C), call (R), edit (U) and delete (D) expenses.
    Google Maps integration: auto-completion of addresses/locations, calculation of route
   distance.
    Calculation of expenses: route distance multiplied by cost rate per kilometre.
   3
   Expense app MERN-Stack
    Dashboard: graphical representation and statistics for administrator and user.
    Responsive UI: functional on mobile devices, tablets and desktops. (Simon's
   suggestion: divide into phases)
    Export functions: Export of reports and expense overviews as PDF or .csv file
    User profile management: editing personal information and settings
3. User flow chart
   Visualisation of how users can navigate through the app.
    Example of the procedure: o User logs in
   o User enters journey details (start and destination)
   o App calculates distance and costs
   o User sends expense entry
   o User sees the history of expense recording and statistics o Consideration of alternative process flows, e.g.
    if the Google Maps API is not available...
    other challenges...
4. Data and information flow
   Various questions arise on this topic.
    How is data transferred between the frontend and backend?
    How should the database be structured to store users, expenses and reports?
    Which API endpoints are required for the app to work? For example
   o /expenses/create o /expenses/update
   A complete list of API endpoints can be found in section 7.2
   Think about security measures for data transmission (e.g. HTTPS, JWT authentication).
5. Data modelling
   5.1 User model (authentication and roles)
   Purpose
    Saves user data (administrator, user)
    Enables authentication (login/logout)
    Assigns roles based on login data (administrator, user)
   Fields (enumeration only; correct naming follows during programming)
    ID (unique identifier)
   The flow chart has so far only been described in text form. An actual diagram is still being
   created.
   4

Expense app MERN-Stack
 Name (full name)
 E-mail (required for registration)
 Password (hashed)
 Role (′′admin′′ | ′′sales_rep′′)
 Date and time stamp (createdAt, updatedAt)
 Password reset token
 Token expiry date
5.2 Expense model (storage of expense reports)
Purpose
 Saves the output(s) for each journey
 Links each output to a user and a category
 Automatic calculation of costs based on the distance travelled
Fields (enumeration only; correct naming follows during programming)
 ID (unique identifier)
 User ID (relationship to the user model)
 Category ID (relationship to the category model)
 Starting point (start address)
 Destination point (destination address)
 Distance in kilometres (calculated distance in kilometres)
 Cost per kilometre (cost rate per kilometre)
 Total cost (automatically calculated: distance km \* cost per km)
 Date (date of the journey)
 Date and time stamp (createdAt, updatedAt)
 Field for "Remarks/Notes" about the trip
5.3 Category model (categorisation/organisation of expenses)
Purpose
 Defines the di􏰀erent types of expenses
 Helps for reporting and filtering
Fields
 ID (unique identifier)
 Designation (e.g. fuel, road tolls, URE (maintenance, repairs, replacement))
 Description (optional details for better comprehensibility)
 Date and time stamp (createdAt, updatedAt)
5.4 Reporting model (statistics and analyses)
Purpose
 Creates a summary of expenses o Numerical
o Visual
 Helps to identify spending trends
Fields
 ID (unique identifier)
 User ID (relationship to the user model)
5

Expense app MERN-Stack
 Month (in which month was the expense incurred)
 Year (in which year the expense was incurred)
 Total distance travelled (total kilometres travelled)
 Total expense amount (sum of expenses incurred)
 Date and time stamp (createdAt, updatedAt)
5.5 Role model (administration of authorisations)
Purpose
 Defines the various roles (Admin, AMA)
 Ensures that only Admin can manage settings
Fields
 ID (unique identifier)
 Role (′′admin′′ | ′′sales_rep′′)
5.6 Settings Model
Purpose
 Defines the system-wide settings o Cost rate per kilometre
o Catering allowance
o Accommodation allowance
o Other flat-rate compensation (e.g. MAUT/vignettes)
6

Expense app MERN-Stack 6. Structure
User Expense Category Report Role
Causes costs
Saves costs
Categorised costs Aggregated costs for reporting Manages access control
7

Expense app MERN-Stack 7. API design with Mongoose, Express.js and Node.js
In order to develop an API for a stack with MongoDB (Mongoose), Express.js and Node.js, I intend to proceed as follows:
7.1 Define requirements for the API
The question arises as to which functionalities the API must enable for this project. These are:
 User authentication: login/logout, role-based access.
 Expense entry: Enter (C), call (R), edit (U) and delete (D) expenses.
 Categorisation of expenses.
 Creation of the reporting system.

9. Database modelling with MongoDB
   Database modelling with MongoDB is a central component of the expense application and forms the foundation for e􏰀icient data storage and retrieval. The document-orientated structure of MongoDB enables a flexible and scalable implementation of the data models.
   9.1 Scheme design
    Development of optimised document structures
   o Implementation of the conceptual data models in MongoDB schemas
   o Application of denormalisation techniques for frequently requested data o Implementation of validation rules at schema level
   o Consideration of document size and query pattern
    Schema definition with Mongoose
   o Use of the Mongoose ODM for structured schema definition
   o Implementation of type testing and data validation
   o Definition of predefined and calculated fields
   o Configuration of schema options such as timestamps and versioning
    Management of relationships between documents
   o Implementation of references for relationships between entities o Strategic embedding of sub-documents for related data
   o Selection of suitable relationship types based on query patterns o Balance between normalisation and denormalisation
    Expandability and versioning
   o Design of flexible schemas for future extensions
   o Implementation of strategies for schema migrations
   o Support for optional fields and variable document structures o Version control for schema changes and extensions
   9.2 Indexing
    Development of a comprehensive indexing strategy
   o Analysis of query patterns and frequency for index optimisation o Implementation of single-field, composite and multi-field indices o Creation of text indices for full-text searches
   o Balancing between query speed and write performance

   12.1 Codedocumentation
    Implementation of standards for the source code
   o Development of consistent documentation guidelines for all code components o Definition of commenting conventions for di􏰀erent languages (JavaScript, CSS) o Implementation of automated documentation checks in the CI/CD pipeline
   o Regular code reviews with a focus on documentation quality
    Inline documentation of functions and components
   o Documentation of function purposes, parameters and return values o Description of complex algorithms and business logic
   o Explanation of non-obvious implementation decisions
   o Labelling of known restrictions or potential pitfalls
    Architectural and structural documentation
   o Creation of architecture diagrams for system and component relationships o Documentation of the folder structure and module organisation
   o Explanation of design patterns and their application in the project
   o Visualisation of data flows and component interactions
    Automated code documentation generation
   o Use of JSDoc for JavaScript documentation
   o Implementation of documentation generators for React components
   o Creation of type definitions for improved IDE support
   o Automatic generation of documentation websites from code comments
