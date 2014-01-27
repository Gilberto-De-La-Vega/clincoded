import re
from pyramid.view import view_config
from ..contentbase import (
    Root
)
from ..indexing import ELASTIC_SEARCH

sanitize_search_string_re = re.compile(r'[\\\+\-\&\|\!\(\)\{\}\[\]\^\~\:\/\\\*\?]')


def get_filtered_query(term, fields, search_fields):
    return {
        'explain': True,
        'query': {
            'filtered': {
                'query': {
                    'queryString': {
                        'query': term,
                        'analyze_wildcard': True,
                        'analyzer': 'encoded_search_analyzer',
                        'default_operator': 'AND',
                        'fields': search_fields
                    }
                },
                'filter': {
                    'and': {
                        'filters': []
                    }
                }
            }
        },
        'highlight': {
            'fields': {
                '_all': {}
            }
        },
        'facets': {},
        'fields': fields
    }


def sanitize_search_string(text):
    return sanitize_search_string_re.sub(r'\\\g<0>', text)


@view_config(name='search', context=Root, request_method='GET', permission='view')
def search(context, request):
    ''' Search view connects to ElasticSearch and returns the results'''

    result = context.__json__(request)
    params = request.params
    root = request.root
    result.update({
        '@id': '/search/',
        '@type': ['search'],
        'title': 'Search',
        'facets': [],
        '@graph': [],
        'columns': {},
        'count': 0,
        'filters': [],
        'notification': ''
    })

    qs = request.environ.get('QUERY_STRING')
    if qs:
        result['@id'] = '/search/?%s' % qs

    es = request.registry[ELASTIC_SEARCH]
    if 'limit' in params:
        if params['limit'] == 'all':
            size = 99999
        else:
            if params['limit'].isdigit():
                size = params['limit']
            else:
                size = 100
    else:
        size = 100

    try:
        search_term = params['searchTerm'].strip()
        search_term = sanitize_search_string(search_term)
        # Handling whitespaces in the search term
        if not search_term:
            result['notification'] = 'Please enter search term'
            return result
    except:
        if 'type' in params:
            if params['type'] == '*':
                result['notification'] = 'Please enter search term'
                return result
            else:
                search_term = "*"
        else:
            result['notification'] = 'Please enter search term'
            return result

    try:
        search_type = root.collections[params['type']].item_type
        collections = root.by_item_type.keys()
        # handling invalid item types
        if search_type not in collections:
            result['notification'] = '\'' + search_type + '\' is not a valid \'item type\''
            return result
    except:
        # Handling search type
        search_type = '*'
        if not search_term:
            result['notification'] = 'Please enter search term'
            return result
    if search_term == '*' and search_type == '*':
        result['notification'] = 'Please enter search term'
        return result

    # Building query for filters
    fields = ['object.@id', 'object.@type']
    search_fields = []
    if search_type == '*':
        doc_types = ['antibody_approval', 'biosample', 'experiment', 'target', 'dataset']
    else:
        doc_types = [search_type]

    collections = root.by_item_type
    for doc_type in doc_types:
        collection = root[doc_type]
        schema = collection.schema
        for column in collection.columns:
            fields.append('object.' + column)
            result['columns'].update({column: collection.columns[column]})
        # Adding search fields and boost values
        for value in schema.get('boost_values', ()):
            search_fields = search_fields + ['object.' + value, 'object.' + value + '.standard^2', 'object.' + value + '.untouched^3']

    # Builds filtered query which supports multiple facet selection
    query = get_filtered_query(search_term, list(set(fields)), search_fields)

    # Setting filters
    for key, value in params.iteritems():
        if key not in ['type', 'searchTerm', 'limit', 'format']:
            if value == 'other':
                query['query']['filtered']['filter']['and']['filters'] \
                    .append({'missing': {'field': 'object.' + key}})
            else:
                query['query']['filtered']['filter']['and']['filters'] \
                    .append({'bool': {'must': {'term': {'object.' + key + '.untouched': value}}}})
            result['filters'].append({key: value})

    # Adding facets to the query
    facets = []
    if len(doc_types) > 1:
        facets = [{'Data Type': 'object.@type.untouched'}]
        for facet in facets:
            face = {'terms': {'field': '', 'size': 99999}}
            face['terms']['field'] = facet[facet.keys()[0]]
            query['facets'][facet.keys()[0]] = face
    else:
        facets = root[doc_types[0]].schema['facets']
        for facet in facets:
            face = {'terms': {'field': '', 'size': 99999}}
            face['terms']['field'] = 'object.' + facet[facet.keys()[0]] + '.untouched'
            query['facets'][facet.keys()[0]] = face
            for f in result['filters']:
                if facet[facet.keys()[0]] == f.keys()[0]:
                    del(query['facets'][facet.keys()[0]])

    # Execute the query
    results = es.search(query, index='encoded', doc_type=doc_types, size=size)

    # Loading facets in to the results
    if 'facets' in results:
        facet_results = results['facets']
        if len(doc_types) > 1:
            for facet in facets:
                if facet.keys()[0] in facet_results:
                    face = {}
                    face['field'] = 'type'
                    face[facet.keys()[0]] = []
                    for term in facet_results[facet.keys()[0]]['terms']:
                        if term['term'] in doc_types:
                            face[facet.keys()[0]].append({root.by_item_type[term['term']].__name__: term['count']})
                    result['facets'].append(face)
        else:
            for facet in facets:
                if facet.keys()[0] in facet_results:
                    face = {}
                    face['field'] = facet[facet.keys()[0]]
                    face[facet.keys()[0]] = []
                    for term in facet_results[facet.keys()[0]]['terms']:
                        face[facet.keys()[0]].append({term['term']: term['count']})
                    if len(face[facet.keys()[0]]) > 1:
                        result['facets'].append(face)

    # Loading result rows
    for hit in results['hits']['hits']:
        result_hit = hit['fields']
        result_hit_new = {}
        for c in result_hit:
            result_hit_new[c[7:]] = result_hit[c]
        result['@graph'].append(result_hit_new)

    # Adding count
    result['count'] = results['hits']['total']
    if len(result['@graph']):
        result['notification'] = 'Success'
    else:
        if len(search_term) < 3:
            result['notification'] = 'No results found. Search term should be at least 3 characters long.'
        else:
            result['notification'] = 'No results found'
    return result
