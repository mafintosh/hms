# hms

Work in progress. Ship all kinds of services

```
npm install -g hms
```

Afterwards you should have an command line tool called `hms`.

## Commands

All commands accept the following options

* `--remote,-r` to specify a remote terminal/dock (defaults to localhost)

#### `hms list [service-name?]`

List services and the configuration.

#### `hms add [service-name]`

Add a new service.

* `--start,-s` to specify a `start` script. Ie. `node .` to start a node service
* `--build,-b` to specify a `build` script. Ie. `npm install .` to install node modules
* `--env,-e` to set env varibles. Format is `ENV_VAR=value;ENV_VAR2=value2

#### `hms update [service-name]`

Update an existing service. Accepts the same options as `hms add`.
Note that update will not restart the service. To do this just issue a `hms restart`

#### `hms deploy [service-name]`

Upload cwd as a tarball to service-name and deploy and restart it.

* `--revision` to set a deploy revision tag. Defaults to `git describe` if you are in a git repo.

#### `hms remove [service-name]`

Stop and remove a service.

#### `hms start|stop|restart [service-name]`

Send a start/stop/restart signal the service. All restarts can be done gracefully by listening for `SIGTERM` and exiting nicely.

#### `hms ps [service-name?]`

List processes running on all docks. Omit the service name to list all processes.

* `--env` to also list the environment that the processes use.

#### `hms log [service-name?]`

Tail the log of a service. Omit the service name to tail all services.

## License

MIT
