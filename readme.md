# 5HTP Framework

Full Stack Typescript framework designed for **developers and users experience**.

## Purposes and values

* **Build more with less code** with syntax sugars and an architecture designed to provide a good code-writing experience.
* **Put everything in symbiose** so frontend, backend and all services works together in a smart way.
* **Write high quality & reliable apps** thanks to strong types checking, suggestions and built-in debugging toolset.
* **Performance minded** because a fast and responsive app reduces server resources consumption and contributes to your users satisfaction.

## Features

* Fully written in **Typescript**
* Services management system
* **Preact** with built-in SSR support
* Highly convenient **MySQL client**
* Universal schema / forms **validator**
* Ful stack router
* Cache system
* And more

## Get Started

1. Install:

`npm i -g 5htp`

2. Create a project:

`5htp init`

3. Launch dev server:

`5htp dev`

4. Build for production:

`5htp build`

## To be done:

- [ ] Update templates & documentation
- [ ] HMR
- [ ] Debugging / Monitoring UI
    - All services and status: installed / paused / running
    - Router: 
        - list of registered files
        - list of pages / api / error routes / layouts
        - latest requests + performance
    - Logs: recent logs terminal
    - Database: recent queries + performance
    - Page rendering: performance
    - Socket: who is connected
- [ ] Add testing tools
- [ ] Possibility to generate static pages
- [ ] Improve ORM: make definition based on code instead of database structure
- [ ] Automatically generates types that associate api routes urls to their return types
- [ ] Allow to create CLI apps
- [ ] Fix Typescript errors