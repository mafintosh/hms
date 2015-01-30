# hms

Ship all kinds of services.

```
npm install -g hms
```

Afterwards you should have an command line tool called `hms`.

## Getting started
HMS can deploy to any server that has ssh and a HMS terminal running. For simplicity sake will we create a HMS terminal with a dock on the local machine, and deploy a simple service to that.

First; create a folder on your local machine and start up a terminal from that folder.

	hms run-terminal --dock

`localhost:10002` is the address to the terminal running on the machine. The `--dock` argument will create a dock on the terminal, and the this dock will run on `localhost:10003`.

A terminal is a server managing docks, and a dock is a process that you can deploy and run your services on. Let us try to create and deploy a service:

Initialize a node project using `npm init` in a folder and implement a simple "hello, world!"-webserver. Then setup a HMS deploy environment by typing the following in the root of that project.

	hms add localhost --start 'node .' --build 'npm install'

The `--start` argument specify a start script, the `--build` specify a build script that will run after a successful deploy. You can now verify this configuration by typing `hms info localhost`.

We are now ready to deploy the service. Still in the project root type the following:

	hms deploy localhost

The terminal output will show the deploy progress and the service logs when the service has started.

HMS is not only for Node projects. By changing the start and build arguments you can deploy and run just about any service.

## Commands

All commands have the following syntax

```
hms [command] [remote] [service|dock?] [options]
```

#### `hms remotes`

Manage and verify remotes.

* `hms remotes add [remote-name] [remote-url]` to add a new remote
* `hms remotes remove [remote-name]` to remove a remote
* `hms remotes` to list all remotes

* `--key,-k` to specify an explicit ssh key. Per default `~/.ssh/id_rsa` and the ssh agent is used.

#### `hms docks [remote] [dock-name?]`

List the docks on a given remote. Detailed information about the services on the given dock is printed if a dock name is specified.

#### `hms services [remote] [service-name?]`

List the services on a given remote. Detailed information about the service, and the docks it is running on, is printed if a service name is specified.

#### `hms info [remote] [service-name]`
Print detailed information about a service, and the docks it is running on, on a remote.

#### `hms add [remote] [service-name]`

Add a new service.

* `--start,-s` to specify a `start` script. Ie. `node .` to start a node service
* `--build,-b` to specify a `build` script. Ie. `npm install .` to install node modules
* `--tag,-t` to specify the docks tags to match when choosing where to deploy to.
* `--limit,-l` to set a max limit on the number of docks to deploy to.
* `--env,-e` to set env varibles. Format is `ENV_VAR=value` if more than one env variable is needed multiple `--env` can be used.

#### `hms update [remote] [service-name]`

Update an existing service. Accepts the same options as `hms add`.
Note that update will not restart the service. To do this just issue a `hms restart`

To delete an env variable just set it to an empty string, i.e. `ENV_VAR=`

#### `hms deploy [remote] [service-name]`

Upload cwd as a tarball to service-name and deploy and restart it.

* `--revision` to set a deploy revision tag. Defaults to `git describe` if you are in a git repo.

After deploying `hms` will tail service output and print it to stdout until you hit `ctrl+c`.

#### `hms remove [remote] [service-name]`

Stop and remove a service.

#### `hms start|stop|restart [remote] [service-name]`

Send a start/stop/restart signal the service. All restarts can be done gracefully by listening for `SIGTERM` and exiting nicely.

#### `hms ps [remote] [service-name?]`

*(deprecated, please use `info` instead)*

List processes running on all docks. Omit the service name to list all processes.

* `--env` to also list the environment that the processes use.

#### `hms log [remote] [service-name?]`

Tail the log of a service. Omit the service name to tail all services.
hms does not save any logs so this is just the live tail of stdout/stderr and various events.

## Remote services

Run the following commands on your remote server that you want to deploy to

#### `hms run-terminal`

Starts a "build-and-distribute" hub that you can deploy to. After you deploy to a terminal it will run the build script and distribute the build to the docks.

* `--port,-p` to change the port the terminal binds to. Defaults to 10002
* `--db` to set the db file

#### `hms run-dock [remote]`

Starts a dock that can run and manage services.

* `--id,-i` to give the dock an optional id. Defaults to hostname
* `--port,-p` to change the port the dock binds to. Defaults to 10002
* `--tag,-t` to give this dock some tags that you can match when deploying
* `--db` to set the db file

## License

MIT
